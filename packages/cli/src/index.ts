import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { analyzeSnapshot, type AnalysisReport, type Analyzer } from '@launchproof/core';
import { createRepositorySnapshot, TypeScriptNextAnalyzer } from '@launchproof/analyzers';
import { loadPolicy } from '@launchproof/policies';
import {
  DockerEphemeralRunner,
  ScannerOutputAnalyzer,
  SentenAssuranceExchangeAnalyzer,
  SentenPlatformAdapter,
  analyzersFromPlatformAdapters,
} from '@launchproof/integrations';
import type { SentenAssuranceExchangeBundle } from '@launchproof/contracts';

async function readGitMeta(root: string) {
  try {
    const head = (await readFile(path.join(root, '.git', 'HEAD'), 'utf8')).trim();
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5);
      try {
        const commit = (await readFile(path.join(root, '.git', ref), 'utf8')).trim();
        return { branch: ref.replace('refs/heads/', ''), commit };
      } catch {
        const packed = await readFile(path.join(root, '.git', 'packed-refs'), 'utf8');
        const row = packed.split('\n').find((line) => line.endsWith(` ${ref}`));
        if (row) return { branch: ref.replace('refs/heads/', ''), commit: row.split(' ')[0]! };
      }
    }
    return { branch: 'detached', commit: head };
  } catch {
    return { branch: 'working-tree', commit: 'WORKTREE' };
  }
}

export interface AnalyzeRepositoryOptions {
  scannerResults?: Array<{ format: string; path: string; scannerVersion?: string }>;
  authorizeDynamicVerification?: boolean;
  allowedRunnerImages?: string[];
  requirePinnedRunnerImage?: boolean;
  scannerMaxBytes?: number;
  sentenAssuranceExchanges?: SentenAssuranceExchangeBundle[];
}

export async function analyzeRepository(
  root: string,
  options: AnalyzeRepositoryOptions = {},
): Promise<AnalysisReport> {
  const absolute = path.resolve(root);
  const git = await readGitMeta(absolute);
  const policy = await loadPolicy(path.join(absolute, '.launchproof.yml'));
  const snapshot = await createRepositorySnapshot(
    absolute,
    { repository: path.basename(absolute), ...git },
    { excludePaths: policy.analysis?.excludePaths ?? [] },
  );
  const analyzers: Analyzer[] = [
    new TypeScriptNextAnalyzer(),
    ...analyzersFromPlatformAdapters(snapshot, [new SentenPlatformAdapter()]),
  ];
  for (const bundle of options.sentenAssuranceExchanges ?? []) {
    analyzers.push(new SentenAssuranceExchangeAnalyzer(bundle));
  }
  for (const scanner of options.scannerResults ?? []) {
    const scannerPath = path.resolve(scanner.path);
    const scannerStat = await stat(scannerPath);
    const maxScannerBytes = options.scannerMaxBytes ?? 25_000_000;
    if (!scannerStat.isFile())
      throw new Error(`Scanner result is not a regular file: ${scanner.path}`);
    if (scannerStat.size > maxScannerBytes)
      throw new Error(
        `Scanner result exceeds safe size limit (${maxScannerBytes} bytes): ${scanner.path}`,
      );
    const content = await readFile(scannerPath, 'utf8');
    analyzers.push(
      new ScannerOutputAnalyzer({
        scanner: scanner.format,
        ...(scanner.scannerVersion ? { scannerVersion: scanner.scannerVersion } : {}),
        format: scanner.format,
        content,
      }),
    );
  }
  const runner = options.authorizeDynamicVerification
    ? new DockerEphemeralRunner({
        allowedImages: options.allowedRunnerImages ?? [],
        requirePinnedImage: options.requirePinnedRunnerImage ?? true,
      })
    : undefined;
  return analyzeSnapshot(snapshot, policy, analyzers, '1.0.0-rc.1', {
    ...(runner ? { runner } : {}),
    authorizeDynamicVerification: Boolean(options.authorizeDynamicVerification),
  });
}

export function formatReport(report: AnalysisReport): string {
  const lines = [
    `Drantis ${report.provenance.launchProofVersion}`,
    `${report.provenance.repository}@${report.provenance.commit.slice(0, 12)}`,
    `Decision: ${report.release.status} (${report.release.score}/100)`,
    `Coverage: ${report.release.coverage ?? 0}%`,
    `Evidence: ${report.evidence.length} | Findings: ${report.findings.length} | Graph: ${report.graph.nodes.length} nodes / ${report.graph.edges.length} edges`,
    '',
    'Assurance Cases:',
  ];
  for (const item of report.assuranceCases)
    lines.push(`  ${item.state.padEnd(10)} ${item.id}  ${item.claim}`);
  if (report.release.blockers.length)
    lines.push('', 'Blockers:', ...report.release.blockers.map((item) => `  - ${item}`));
  if (report.release.conditions.length)
    lines.push('', 'Conditions:', ...report.release.conditions.map((item) => `  - ${item}`));
  return lines.join('\n');
}

export function toSarif(report: AnalysisReport) {
  const rules = [
    ...new Map(
      report.findings.map((item) => [
        item.ruleId,
        { id: item.ruleId, name: item.title, shortDescription: { text: item.title } },
      ]),
    ).values(),
  ];
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'Drantis',
            version: report.provenance.launchProofVersion,
            informationUri: 'https://github.com/drantislabs/drantis',
            rules,
          },
        },
        results: report.findings
          .filter((item) => item.status === 'open')
          .map((item) => ({
            ruleId: item.ruleId,
            level:
              item.severity === 'critical' || item.severity === 'high'
                ? 'error'
                : item.severity === 'medium'
                  ? 'warning'
                  : 'note',
            message: { text: `${item.title}: ${item.explanation}` },
            locations: item.source
              ? [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: item.source.path },
                      region: item.source.line ? { startLine: item.source.line } : undefined,
                    },
                  },
                ]
              : undefined,
            properties: {
              evidenceIds: item.evidenceIds,
              confidence: item.confidence,
              severity: item.severity,
            },
          })),
      },
    ],
  };
}
