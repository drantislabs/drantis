import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { AI_DATA_POLICIES, ASSURANCE_DOMAINS, SEVERITIES } from '@launchproof/contracts';
import type { DrantisPolicyShape } from '@launchproof/contracts';

const verificationCommandSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    command: z.string().min(1).max(200),
    args: z.array(z.string().max(500)).max(32).optional(),
    purpose: z.string().min(1).max(500),
    timeoutMs: z.number().int().min(1_000).max(900_000).optional(),
    network: z.enum(['none', 'restricted']).default('none'),
    image: z.string().min(1).max(300).optional(),
  })
  .strict();

export const policySchema = z
  .object({
    version: z.literal(1),
    analysis: z
      .object({ excludePaths: z.array(z.string().min(1).max(300)).max(128).default([]) })
      .strict()
      .default({ excludePaths: [] }),
    assurance: z
      .object({ requiredDomains: z.array(z.enum(ASSURANCE_DOMAINS)).default([]) })
      .strict()
      .default({ requiredDomains: [] }),
    security: z
      .object({
        failOnSeverity: z.enum(SEVERITIES).default('high'),
        requireNoDetectedSecrets: z.boolean().default(true),
        requireAuthorizationForProtectedRoutes: z.boolean().default(true),
        requireRateLimitForPublicMutation: z.boolean().default(false),
      })
      .strict()
      .default({
        failOnSeverity: 'high',
        requireNoDetectedSecrets: true,
        requireAuthorizationForProtectedRoutes: true,
        requireRateLimitForPublicMutation: false,
      }),
    tenancy: z
      .object({ required: z.boolean().default(false), requireRls: z.boolean().default(false) })
      .strict()
      .default({ required: false, requireRls: false }),
    testing: z
      .object({
        requireTestFiles: z.boolean().default(false),
        requireVerifiedTests: z.boolean().default(false),
      })
      .strict()
      .default({ requireTestFiles: false, requireVerifiedTests: false }),
    production: z
      .object({
        requireReleaseProvenance: z.boolean().default(true),
        requireSecurityHeaders: z.boolean().default(false),
        requireObservability: z.boolean().default(false),
      })
      .strict()
      .default({
        requireReleaseProvenance: true,
        requireSecurityHeaders: false,
        requireObservability: false,
      }),
    releaseGates: z
      .object({
        blockOnFailedAssuranceCase: z.boolean().default(true),
        blockOnCriticalFinding: z.boolean().default(true),
        minimumScore: z.number().int().min(0).max(100).default(80),
        minimumCoverage: z.number().int().min(0).max(100).default(50),
      })
      .strict()
      .default({
        blockOnFailedAssuranceCase: true,
        blockOnCriticalFinding: true,
        minimumScore: 80,
        minimumCoverage: 50,
      }),
    ai: z
      .object({
        dataPolicy: z.enum(AI_DATA_POLICIES).default('evidence-only'),
        allowedProviders: z.array(z.string().min(1)).max(32).default([]),
      })
      .strict()
      .default({ dataPolicy: 'evidence-only', allowedProviders: [] }),
    verification: z
      .object({
        enabled: z.boolean().default(false),
        commands: z
          .array(verificationCommandSchema)
          .max(16)
          .default([])
          .superRefine((commands, ctx) => {
            const seen = new Set<string>();
            commands.forEach((command, index) => {
              if (seen.has(command.id))
                ctx.addIssue({
                  code: 'custom',
                  message: `Duplicate verification command id: ${command.id}`,
                  path: [index, 'id'],
                });
              seen.add(command.id);
            });
          }),
      })
      .strict()
      .default({ enabled: false, commands: [] }),
  })
  .strict();

export type DrantisPolicy = z.infer<typeof policySchema>;
/** @deprecated Use DrantisPolicy. */
export type LaunchProofPolicy = DrantisPolicy;
export const defaultPolicy: DrantisPolicy = policySchema.parse({ version: 1 });

export function parsePolicy(raw: string, source = '.drantis.yml'): DrantisPolicy {
  try {
    const doc = YAML.parse(raw, { maxAliasCount: 20 });
    return policySchema.parse(doc);
  } catch (error) {
    throw new Error(
      `Invalid Drantis policy (${source}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function loadPolicy(filePath: string): Promise<DrantisPolicy> {
  try {
    const raw = await readFile(filePath, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > 256_000)
      throw new Error('Policy exceeds maximum size (256KB).');
    return parsePolicy(raw, filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultPolicy;
    if (error instanceof Error && error.message.startsWith('Invalid Drantis policy'))
      throw error;
    throw new Error(
      `Invalid Drantis policy (${filePath}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function loadRepositoryPolicy(root: string): Promise<DrantisPolicy> {
  const primary = path.join(root, '.drantis.yml');
  try {
    await access(primary);
    return loadPolicy(primary);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return loadPolicy(path.join(root, '.launchproof.yml'));
}

function mergeObject<T extends Record<string, any>>(base: T, overlay: Partial<T>): T {
  const output: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof output[key] === 'object' &&
      !Array.isArray(output[key])
    )
      output[key] = mergeObject(output[key], value);
    else if (value !== undefined) output[key] = value;
  }
  return output as T;
}

/**
 * Deterministic policy hierarchy: Drantis Standard -> organization -> repository -> branch/release.
 * Each layer is validated before and after merging; unknown keys fail closed.
 */
export function inheritPolicies(
  layers: Array<Partial<DrantisPolicyShape> | undefined>,
): DrantisPolicy {
  let merged: Record<string, any> = structuredClone(defaultPolicy);
  for (const layer of layers) if (layer) merged = mergeObject(merged, layer as Record<string, any>);
  return policySchema.parse(merged);
}
