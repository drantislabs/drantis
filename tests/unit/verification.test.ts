import { describe, expect, it } from 'vitest';
import {
  analyzeSnapshot,
  ExecutionDisabledRunner,
  type IsolatedRunner,
  type DrantisPolicyShape,
} from '@launchproof/core';
import { DockerEphemeralRunner } from '@launchproof/integrations';

const snapshot = {
  root: '/repo',
  repository: 'repo',
  branch: 'main',
  commit: 'abc',
  files: new Map<string, string>(),
};
const policy: DrantisPolicyShape = {
  version: 1,
  assurance: { requiredDomains: [] },
  security: { failOnSeverity: 'high', requireNoDetectedSecrets: true },
  tenancy: { required: false },
  testing: { requireTestFiles: false },
  production: { requireReleaseProvenance: true },
  releaseGates: { blockOnFailedAssuranceCase: true, blockOnCriticalFinding: true },
  ai: { dataPolicy: 'local-only' },
  verification: {
    enabled: true,
    commands: [
      {
        id: 'tests',
        command: 'npm',
        args: ['test'],
        purpose: 'Run tests',
        image: 'drantis-runner:test',
      },
    ],
  },
};

describe('dynamic verification boundary', () => {
  it('does not execute when invocation authorization is absent', async () => {
    const report = await analyzeSnapshot(snapshot, policy, []);
    expect(report.evidence.some((item) => item.kind === 'verification.authorization-missing')).toBe(
      true,
    );
    expect(report.evidence.some((item) => item.certainty === 'VERIFIED')).toBe(false);
  });

  it('requires an isolated runner after explicit authorization', async () => {
    await expect(
      analyzeSnapshot(snapshot, policy, [], '0.2.0', { authorizeDynamicVerification: true }),
    ).rejects.toThrow(/no isolated runner/i);
    await expect(
      new ExecutionDisabledRunner().execute({
        snapshot,
        command: 'npm',
        purpose: 'x',
        timeoutMs: 1000,
        network: 'none',
        authorizationToken: 'yes',
      }),
    ).rejects.toThrow(/disabled/i);
  });

  it('creates VERIFIED evidence only from a completed deterministic runner result', async () => {
    const runner: IsolatedRunner = {
      id: 'test-isolated',
      execute: async () => ({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        startedAt: 'a',
        completedAt: 'b',
        runner: 'test-isolated',
        image: 'drantis-runner:test',
      }),
    };
    const report = await analyzeSnapshot(snapshot, policy, [], '0.2.0', {
      authorizeDynamicVerification: true,
      runner,
    });
    expect(report.evidence.find((item) => item.kind === 'verification.tests')?.certainty).toBe(
      'VERIFIED',
    );
    expect(report.assuranceCases.find((item) => item.id === 'AC-TESTS-001')?.state).toBe(
      'VERIFIED',
    );
  });

  it('redacts provider credentials from retained verification output', async () => {
    const runner: IsolatedRunner = {
      id: 'test-isolated',
      execute: async () => ({
        exitCode: 0,
        stdout: 'OPENAI_API_KEY=sk-proj-supersecretcredential123456789',
        stderr: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456',
        startedAt: 'a',
        completedAt: 'b',
        runner: 'test-isolated',
        image: 'drantis-runner:test',
      }),
    };
    const report = await analyzeSnapshot(snapshot, policy, [], '0.2.0', {
      authorizeDynamicVerification: true,
      runner,
    });
    const serialized = JSON.stringify(
      report.evidence.find((item) => item.kind === 'verification.tests'),
    );
    expect(serialized).not.toContain('supersecretcredential');
    expect(serialized).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    expect(serialized).toContain('[REDACTED');
  });

  it('requires a host-owned runner image allowlist before Docker is invoked', async () => {
    const runner = new DockerEphemeralRunner({ allowedImages: [] });
    await expect(
      runner.execute({
        snapshot,
        command: 'npm',
        args: ['test'],
        purpose: 'test',
        timeoutMs: 1000,
        network: 'none',
        image: 'node:24',
        authorizationToken: 'explicit',
      }),
    ).rejects.toThrow(/host runner image allowlist is empty/i);
  });

  it('requires allowlisted runner images to be pinned by digest by default', async () => {
    const runner = new DockerEphemeralRunner({ allowedImages: ['node:24'] });
    await expect(
      runner.execute({
        snapshot,
        command: 'npm',
        args: ['test'],
        purpose: 'test',
        timeoutMs: 1000,
        network: 'none',
        image: 'node:24',
        authorizationToken: 'explicit',
      }),
    ).rejects.toThrow(/pinned by sha256/i);
  });
});
