import { spawn } from 'node:child_process';
import path from 'node:path';
import type {
  AnalyzerContext,
  AnalyzerOutput,
  Evidence,
  ExecutionRequest,
  ExecutionResult,
  Finding,
  IsolatedRunner,
  ScannerAdapter,
  ScannerResultInput,
  Severity,
} from '@launchproof/contracts';
import { createEvidence, stableId } from '@launchproof/evidence';

const VERSION = '1.0.0-rc.1';

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Scanner result is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
function severity(input: unknown): Severity {
  const value = String(input ?? '').toLowerCase();
  if (value.includes('critical')) return 'critical';
  if (value.includes('high') || value.includes('error')) return 'high';
  if (value.includes('medium') || value.includes('warning')) return 'medium';
  if (value.includes('low')) return 'low';
  return 'info';
}
function location(pathValue: unknown, lineValue?: unknown) {
  const path =
    typeof pathValue === 'string' && pathValue.length
      ? pathValue.replaceAll('\\', '/')
      : 'scanner-output';
  const line =
    typeof lineValue === 'number' && Number.isFinite(lineValue)
      ? Math.max(1, Math.trunc(lineValue))
      : undefined;
  return { path, ...(line ? { line } : {}) };
}
function evidence(
  ctx: AnalyzerContext,
  adapter: ScannerAdapter,
  kind: string,
  title: string,
  description: string,
  data: unknown,
  source?: { path: string; line?: number },
): Evidence {
  return createEvidence({
    kind,
    certainty: 'DETECTED',
    title,
    description,
    analyzer: { id: adapter.id, version: adapter.version },
    provenance: ctx.provenance,
    ...(source ? { source } : {}),
    data,
  });
}
function finding(
  adapter: ScannerAdapter,
  input: {
    discriminator: string;
    ruleId: string;
    title: string;
    domain?: Finding['domain'];
    severity: Severity;
    confidence?: number;
    evidenceIds: string[];
    source?: Finding['source'];
    cwe?: string[];
    owasp?: string[];
    explanation: string;
    impact: string;
    remediation: string;
    affected?: string[];
  },
): Finding {
  return {
    id: stableId('finding', adapter.id, input.discriminator),
    ruleId: input.ruleId,
    title: input.title,
    domain: input.domain ?? 'security',
    severity: input.severity,
    confidence: input.confidence ?? 0.95,
    status: 'open',
    ...(input.source ? { source: input.source } : {}),
    evidenceIds: input.evidenceIds,
    ...(input.cwe ? { cwe: input.cwe } : {}),
    ...(input.owasp ? { owasp: input.owasp } : {}),
    affectedComponents: input.affected ?? (input.source ? [input.source.path] : []),
    graphPaths: [],
    explanation: input.explanation,
    impact: input.impact,
    remediation: input.remediation,
    analyzer: { id: adapter.id, version: adapter.version },
  };
}

export class SemgrepAdapter implements ScannerAdapter {
  id = 'scanner-semgrep';
  version = VERSION;
  supports(format: string) {
    return format === 'semgrep-json';
  }
  normalize(input: ScannerResultInput, ctx: AnalyzerContext): AnalyzerOutput {
    const doc = safeJson(input.content) as any;
    const outputEvidence: Evidence[] = [];
    const findings: Finding[] = [];
    for (const item of Array.isArray(doc?.results) ? doc.results : []) {
      const source = location(item?.path, item?.start?.line);
      const ev = evidence(
        ctx,
        this,
        'scanner.semgrep',
        `Semgrep: ${item?.check_id ?? 'rule'}`,
        item?.extra?.message ?? 'Semgrep reported a static-analysis result.',
        {
          checkId: item?.check_id,
          severity: item?.extra?.severity,
          metadata: item?.extra?.metadata ?? {},
          scannerVersion: input.scannerVersion,
        },
        source,
      );
      outputEvidence.push(ev);
      findings.push(
        finding(this, {
          discriminator: `${item?.check_id}:${source.path}:${source.line ?? 0}`,
          ruleId: item?.extra?.metadata?.launchproof_control ?? 'LP-07',
          title: item?.extra?.message ?? item?.check_id ?? 'Semgrep finding',
          severity: severity(item?.extra?.severity),
          evidenceIds: [ev.id],
          source,
          cwe: Array.isArray(item?.extra?.metadata?.cwe)
            ? item.extra.metadata.cwe.map(String)
            : undefined,
          owasp: Array.isArray(item?.extra?.metadata?.owasp)
            ? item.extra.metadata.owasp.map(String)
            : undefined,
          explanation:
            'Semgrep emitted this result from static analysis. Drantis normalized it without changing scanner semantics.',
          impact: 'Impact depends on the matched Semgrep rule and affected data/control path.',
          remediation:
            item?.extra?.metadata?.fix ??
            'Review the scanner rule guidance and remediate the matched unsafe pattern.',
        }),
      );
    }
    return { evidence: outputEvidence, findings };
  }
}

export class GitleaksAdapter implements ScannerAdapter {
  id = 'scanner-gitleaks';
  version = VERSION;
  supports(format: string) {
    return format === 'gitleaks-json';
  }
  normalize(input: ScannerResultInput, ctx: AnalyzerContext): AnalyzerOutput {
    const doc = safeJson(input.content);
    const rows = Array.isArray(doc) ? doc : [];
    const outputEvidence: Evidence[] = [];
    const findings: Finding[] = [];
    for (const item of rows as any[]) {
      const source = location(item?.File, item?.StartLine);
      const ev = evidence(
        ctx,
        this,
        'scanner.gitleaks',
        `Gitleaks: ${item?.Description ?? item?.RuleID ?? 'secret'}`,
        'Gitleaks reported a secret candidate. Secret content is intentionally not copied into Drantis evidence.',
        {
          ruleId: item?.RuleID,
          description: item?.Description,
          commit: item?.Commit,
          fingerprint: item?.Fingerprint,
          scannerVersion: input.scannerVersion,
          redacted: true,
        },
        source,
      );
      outputEvidence.push(ev);
      findings.push(
        finding(this, {
          discriminator: String(
            item?.Fingerprint ?? `${source.path}:${source.line ?? 0}:${item?.RuleID}`,
          ),
          ruleId: 'LP-06',
          title: `Potential secret: ${item?.Description ?? item?.RuleID ?? 'Gitleaks match'}`,
          severity: 'critical',
          evidenceIds: [ev.id],
          source,
          cwe: ['CWE-798'],
          explanation:
            'Gitleaks detected a credential/secret pattern. Drantis stores only metadata and a fingerprint, not the secret value.',
          impact: 'A valid exposed credential can permit unauthorized access.',
          remediation:
            'Revoke/rotate the credential and purge it from repository history where appropriate.',
        }),
      );
    }
    return { evidence: outputEvidence, findings };
  }
}

export class OsvAdapter implements ScannerAdapter {
  id = 'scanner-osv';
  version = VERSION;
  supports(format: string) {
    return format === 'osv-json';
  }
  normalize(input: ScannerResultInput, ctx: AnalyzerContext): AnalyzerOutput {
    const doc = safeJson(input.content) as any;
    const groups = Array.isArray(doc?.results) ? doc.results : [];
    const outputEvidence: Evidence[] = [];
    const findings: Finding[] = [];
    for (const group of groups)
      for (const pkg of Array.isArray(group?.packages) ? group.packages : [])
        for (const vuln of Array.isArray(pkg?.vulnerabilities) ? pkg.vulnerabilities : []) {
          const name = pkg?.package?.name ?? pkg?.package?.purl ?? 'dependency';
          const id = vuln?.id ?? vuln?.aliases?.[0] ?? 'OSV';
          const ev = evidence(
            ctx,
            this,
            'scanner.osv',
            `OSV vulnerability ${id}`,
            'OSV reported a vulnerability affecting a resolved dependency.',
            {
              id,
              aliases: vuln?.aliases ?? [],
              package: name,
              version: pkg?.package?.version,
              modified: vuln?.modified,
              scannerVersion: input.scannerVersion,
            },
            { path: 'dependency-lock' },
          );
          outputEvidence.push(ev);
          findings.push(
            finding(this, {
              discriminator: `${id}:${name}:${pkg?.package?.version ?? ''}`,
              ruleId: 'LP-08',
              title: `${id} affects ${name}`,
              severity: severity(
                vuln?.database_specific?.severity ?? vuln?.severity?.[0]?.score ?? 'high',
              ),
              evidenceIds: [ev.id],
              source: { path: 'dependency-lock' },
              explanation:
                'The OSV adapter normalized a dependency vulnerability from supplied scanner output.',
              impact:
                vuln?.summary ??
                'A vulnerable dependency can expose the application to the behavior described by the advisory.',
              remediation:
                'Upgrade to a non-affected version or apply the advisory mitigation, then rescan.',
            }),
          );
        }
    return { evidence: outputEvidence, findings };
  }
}

export class TrivyAdapter implements ScannerAdapter {
  id = 'scanner-trivy';
  version = VERSION;
  supports(format: string) {
    return format === 'trivy-json';
  }
  normalize(input: ScannerResultInput, ctx: AnalyzerContext): AnalyzerOutput {
    const doc = safeJson(input.content) as any;
    const outputEvidence: Evidence[] = [];
    const findings: Finding[] = [];
    for (const result of Array.isArray(doc?.Results) ? doc.Results : [])
      for (const vuln of Array.isArray(result?.Vulnerabilities) ? result.Vulnerabilities : []) {
        const source = { path: String(result?.Target ?? 'container/dependency') };
        const ev = evidence(
          ctx,
          this,
          'scanner.trivy',
          `Trivy vulnerability ${vuln?.VulnerabilityID ?? 'unknown'}`,
          'Trivy reported a vulnerability in a dependency or container artifact.',
          {
            vulnerabilityId: vuln?.VulnerabilityID,
            package: vuln?.PkgName,
            installedVersion: vuln?.InstalledVersion,
            fixedVersion: vuln?.FixedVersion,
            severity: vuln?.Severity,
            scannerVersion: input.scannerVersion,
          },
          source,
        );
        outputEvidence.push(ev);
        findings.push(
          finding(this, {
            discriminator: `${vuln?.VulnerabilityID}:${vuln?.PkgName}:${vuln?.InstalledVersion}`,
            ruleId: 'LP-08',
            title: `${vuln?.VulnerabilityID ?? 'Vulnerability'} in ${vuln?.PkgName ?? 'dependency'}`,
            severity: severity(vuln?.Severity),
            evidenceIds: [ev.id],
            source,
            explanation: vuln?.Title ?? 'Trivy reported a vulnerable artifact.',
            impact:
              vuln?.Description ?? 'The affected artifact may expose known vulnerable behavior.',
            remediation: vuln?.FixedVersion
              ? `Upgrade ${vuln?.PkgName} to ${vuln.FixedVersion} or later where compatible.`
              : 'Apply the vendor/advisory mitigation and rescan.',
          }),
        );
      }
    for (const result of Array.isArray(doc?.Results) ? doc.Results : [])
      for (const secret of Array.isArray(result?.Secrets) ? result.Secrets : []) {
        const source = location(result?.Target, secret?.StartLine);
        const ev = evidence(
          ctx,
          this,
          'scanner.trivy-secret',
          `Trivy secret: ${secret?.Title ?? secret?.RuleID ?? 'candidate'}`,
          'Trivy reported a secret candidate. Secret content is redacted.',
          {
            ruleId: secret?.RuleID,
            category: secret?.Category,
            severity: secret?.Severity,
            redacted: true,
          },
          source,
        );
        outputEvidence.push(ev);
        findings.push(
          finding(this, {
            discriminator: `${result?.Target}:${secret?.StartLine}:${secret?.RuleID}`,
            ruleId: 'LP-06',
            title: `Potential secret: ${secret?.Title ?? secret?.RuleID ?? 'Trivy match'}`,
            severity: 'critical',
            evidenceIds: [ev.id],
            source,
            cwe: ['CWE-798'],
            explanation: 'Trivy secret scanning reported a candidate credential.',
            impact: 'A valid exposed credential can permit unauthorized access.',
            remediation: 'Revoke/rotate and remove the credential from source and history.',
          }),
        );
      }
    return { evidence: outputEvidence, findings };
  }
}

export const builtInScannerAdapters: ScannerAdapter[] = [
  new SemgrepAdapter(),
  new GitleaksAdapter(),
  new OsvAdapter(),
  new TrivyAdapter(),
];
export function normalizeScannerResult(
  input: ScannerResultInput,
  context: AnalyzerContext,
  adapters: ScannerAdapter[] = builtInScannerAdapters,
): AnalyzerOutput {
  const adapter = adapters.find((item) => item.supports(input.format));
  if (!adapter) throw new Error(`Unsupported scanner result format: ${input.format}`);
  return adapter.normalize(input, context);
}

export class ScannerOutputAnalyzer {
  id: string;
  version = VERSION;
  constructor(
    private readonly input: ScannerResultInput,
    private readonly adapters: ScannerAdapter[] = builtInScannerAdapters,
  ) {
    this.id = `scanner-output:${input.format}`;
  }
  analyze(context: AnalyzerContext): AnalyzerOutput {
    const output = normalizeScannerResult(this.input, context, this.adapters);
    const receipt = createEvidence({
      kind: 'scanner.result-import',
      certainty: 'DETECTED',
      title: `${this.input.scanner} scanner result imported`,
      description:
        'Drantis parsed supplied scanner output through a normalized adapter. Import evidence does not prove the scanner command itself was executed by Drantis.',
      analyzer: { id: this.id, version: this.version },
      provenance: context.provenance,
      data: {
        scanner: this.input.scanner,
        format: this.input.format,
        scannerVersion: this.input.scannerVersion ?? null,
        inputBytes: Buffer.byteLength(this.input.content, 'utf8'),
        normalizedEvidence: output.evidence.length,
        normalizedFindings: output.findings.length,
      },
    });
    return { ...output, evidence: [receipt, ...output.evidence] };
  }
}

export interface DockerRunnerOptions {
  dockerBinary?: string;
  defaultImage?: string;
  memoryMb?: number;
  cpus?: number;
  pidsLimit?: number;
  allowedImages?: string[];
  requirePinnedImage?: boolean;
}

export class DockerEphemeralRunner implements IsolatedRunner {
  id = 'docker-ephemeral';
  constructor(private readonly options: DockerRunnerOptions = {}) {}
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!request.authorizationToken)
      throw new Error('Explicit authorization token is required for dynamic verification.');
    const image = request.image ?? this.options.defaultImage;
    if (!image) throw new Error('An explicit runner image is required.');
    if (!this.options.allowedImages?.length)
      throw new Error('Host runner image allowlist is empty; dynamic verification fails closed.');
    if (!this.options.allowedImages.includes(image))
      throw new Error(`Runner image is not allowlisted by the Drantis host: ${image}`);
    if (!/^[a-zA-Z0-9._/@:-]+$/.test(image))
      throw new Error('Runner image contains unsupported characters.');
    if (
      this.options.requirePinnedImage !== false &&
      !(/@sha256:[a-f0-9]{64}$/i.test(image) || /^sha256:[a-f0-9]{64}$/i.test(image))
    )
      throw new Error('Runner image must be pinned by sha256 digest or image ID.');
    if (!request.command || /[\r\n\0]/.test(request.command))
      throw new Error('Invalid verification command.');
    if (request.network === 'restricted')
      throw new Error(
        'Restricted egress networking is not configured; runner fails closed instead of granting bridge access.',
      );
    const root = path.resolve(request.snapshot.root);
    const startedAt = new Date().toISOString();
    const dockerArgs = [
      'run',
      '--rm',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--memory',
      `${this.options.memoryMb ?? 512}m`,
      '--cpus',
      String(this.options.cpus ?? 1),
      '--pids-limit',
      String(this.options.pidsLimit ?? 128),
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      '--tmpfs',
      '/workspace-tmp:rw,noexec,nosuid,size=128m',
      '--network',
      'none',
      '--mount',
      `type=bind,src=${root},dst=/workspace,readonly`,
      '--workdir',
      '/workspace',
      image,
      request.command,
      ...(request.args ?? []),
    ];
    const dockerBinary = this.options.dockerBinary ?? 'docker';
    const child = spawn(dockerBinary, dockerArgs, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '', NODE_ENV: process.env.NODE_ENV ?? 'production' },
    });
    let stdout = '',
      stderr = '',
      timedOut = false;
    const outputLimit = 1_000_000;
    child.stdout.on('data', (chunk) => {
      if (stdout.length < outputLimit)
        stdout += String(chunk).slice(0, outputLimit - stdout.length);
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < outputLimit)
        stderr += String(chunk).slice(0, outputLimit - stderr.length);
    });
    const timeout = setTimeout(
      () => {
        timedOut = true;
        child.kill('SIGKILL');
      },
      Math.max(1_000, request.timeoutMs),
    );
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? 137));
    }).finally(() => clearTimeout(timeout));
    return {
      exitCode,
      stdout,
      stderr,
      startedAt,
      completedAt: new Date().toISOString(),
      timedOut,
      runner: this.id,
      image,
    };
  }
}

export * from './extensions.js';

export * from './senten-assurance.js';
