import path from 'node:path';
import {
  analyzeSnapshot,
  sanitizePublicReport,
  type AnalysisProgressEvent,
  type AnalysisReport,
} from '@launchproof/core';
import { createRepositorySnapshot, TypeScriptNextAnalyzer } from '@launchproof/analyzers';
import { loadRepositoryPolicy } from '@launchproof/policies';
import { SentenPlatformAdapter, analyzersFromPlatformAdapters } from '@launchproof/integrations';

export const SHOWCASE_TARGETS = new Map<
  string,
  { label: string; repository: string; relativeRoot: string; branch: string; commit: string }
>([
  [
    'production-reference',
    {
      label: 'Pipeline — Production Reference',
      repository: 'thomasdscx-labs/pipeline',
      relativeRoot: 'scenarios/production-reference',
      branch: 'showcase/reference',
      commit: 'fixture-production-reference',
    },
  ],
  [
    'missing-tenant-authorization',
    {
      label: 'Pipeline — Missing Tenant Authorization',
      repository: 'thomasdscx-labs/pipeline',
      relativeRoot: 'scenarios/missing-tenant-authorization',
      branch: 'showcase/regression',
      commit: 'fixture-missing-tenant-authorization',
    },
  ],
  [
    'launchproof-self',
    {
      label: 'Drantis — Self Analysis',
      repository: 'drantislabs/drantis',
      relativeRoot: '.',
      branch: 'working-tree',
      commit: 'SELF',
    },
  ],
  [
    'senten-reference',
    {
      label: 'Senten — Integration Contract',
      repository: 'thomasdscx-labs/senten',
      relativeRoot: 'scenarios/senten-reference',
      branch: 'showcase/senten',
      commit: 'fixture-senten-reference',
    },
  ],
]);

function repositoryRoot() {
  return path.resolve(process.cwd(), '../..');
}

export async function analyzeAuthorizedScenario(
  scenario: string,
  onProgress?: (event: AnalysisProgressEvent) => void | Promise<void>,
): Promise<AnalysisReport> {
  const selected = SHOWCASE_TARGETS.get(scenario);
  if (!selected) throw new Error('Scenario is not authorized.');
  const repoRoot = repositoryRoot();
  const root = path.resolve(repoRoot, selected.relativeRoot);
  if (root !== repoRoot && !root.startsWith(`${repoRoot}${path.sep}`))
    throw new Error('Invalid authorized repository path.');
  const policy = await loadRepositoryPolicy(root);
  const snapshot = await createRepositorySnapshot(
    root,
    { repository: selected.repository, branch: selected.branch, commit: selected.commit },
    { excludePaths: policy.analysis?.excludePaths ?? [] },
  );
  const analyzers = [
    new TypeScriptNextAnalyzer(),
    ...analyzersFromPlatformAdapters(snapshot, [new SentenPlatformAdapter()]),
  ];
  return analyzeSnapshot(snapshot, policy, analyzers, '1.0.0-rc.1', {
    ...(onProgress ? { onProgress } : {}),
  });
}

export async function publicScenarioReport(scenario: string) {
  return sanitizePublicReport(await analyzeAuthorizedScenario(scenario));
}
