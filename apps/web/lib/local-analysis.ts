import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeSnapshot,
  type AnalysisProgressEvent,
  type AnalysisReport,
} from '@launchproof/core';
import { createRepositorySnapshot, TypeScriptNextAnalyzer } from '@launchproof/analyzers';
import { loadRepositoryPolicy } from '@launchproof/policies';
import { SentenPlatformAdapter, analyzersFromPlatformAdapters } from '@launchproof/integrations';

export function localAnalysisCapability() {
  const configuredRoot =
    process.env.DRANTIS_REPOSITORY_ROOT ?? process.env.LAUNCHPROOF_REPOSITORY_ROOT;
  return {
    enabled:
      (process.env.DRANTIS_LOCAL_MODE ?? process.env.LAUNCHPROOF_LOCAL_MODE) === '1' &&
      Boolean(configuredRoot),
    repositoryRootConfigured: Boolean(configuredRoot),
  };
}

function configuredRepositoryRoot(): string {
  if ((process.env.DRANTIS_LOCAL_MODE ?? process.env.LAUNCHPROOF_LOCAL_MODE) !== '1') {
    throw new Error('Local repository analysis is disabled.');
  }
  const configured =
    process.env.DRANTIS_REPOSITORY_ROOT ?? process.env.LAUNCHPROOF_REPOSITORY_ROOT;
  if (!configured) {
    throw new Error('DRANTIS_REPOSITORY_ROOT is not configured.');
  }
  return path.resolve(configured);
}

function resolveAuthorizedRepository(relativePath: string): string {
  if (!relativePath || relativePath.includes('\0')) {
    throw new Error('Repository path is required.');
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error('Repository path must be relative to DRANTIS_REPOSITORY_ROOT.');
  }
  const allowedRoot = configuredRepositoryRoot();
  const resolved = path.resolve(allowedRoot, relativePath);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('Repository path escapes the configured repository root.');
  }
  return resolved;
}

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

export async function analyzeAuthorizedLocalRepository(
  relativePath: string,
  onProgress?: (event: AnalysisProgressEvent) => void | Promise<void>,
): Promise<AnalysisReport> {
  const root = resolveAuthorizedRepository(relativePath);
  const policy = await loadRepositoryPolicy(root);
  const git = await readGitMeta(root);
  const snapshot = await createRepositorySnapshot(
    root,
    { repository: path.basename(root), ...git },
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
