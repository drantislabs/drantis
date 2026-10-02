import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRepositoryPolicy, policySchema } from '@launchproof/policies';

describe('policy validation', () => {
  it('rejects unknown configuration keys', () => {
    expect(() => policySchema.parse({ version: 1, magic: true })).toThrow();
  });
  it('rejects an unknown AI data policy', () => {
    expect(() =>
      policySchema.parse({ version: 1, ai: { dataPolicy: 'send-everything' } }),
    ).toThrow();
  });
});

describe('Drantis repository policy discovery', () => {
  it('prefers .drantis.yml when both policy files exist', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'drantis-policy-'));
    try {
      await writeFile(
        path.join(root, '.drantis.yml'),
        'version: 1\nsecurity:\n  failOnSeverity: critical\n',
      );
      await writeFile(
        path.join(root, '.launchproof.yml'),
        'version: 1\nsecurity:\n  failOnSeverity: low\n',
      );

      const policy = await loadRepositoryPolicy(root);
      expect(policy.security.failOnSeverity).toBe('critical');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to .launchproof.yml for pre-Drantis repositories', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'drantis-policy-'));
    try {
      await writeFile(
        path.join(root, '.launchproof.yml'),
        'version: 1\nsecurity:\n  failOnSeverity: medium\n',
      );

      const policy = await loadRepositoryPolicy(root);
      expect(policy.security.failOnSeverity).toBe('medium');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('verification policy hardening', () => {
  it('rejects duplicate verification command ids', () => {
    expect(() =>
      policySchema.parse({
        version: 1,
        verification: {
          enabled: true,
          commands: [
            { id: 'tests', command: 'npm', args: ['test'], purpose: 'tests' },
            {
              id: 'tests',
              command: 'npm',
              args: ['run', 'test:security'],
              purpose: 'security tests',
            },
          ],
        },
      }),
    ).toThrow(/duplicate verification command id/i);
  });
});
