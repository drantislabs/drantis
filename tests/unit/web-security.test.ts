import { describe, expect, it } from 'vitest';
import { rateLimit } from '../../apps/web/lib/rate-limit';
import { publicError } from '../../apps/web/lib/request';
import { localAnalysisCapability } from '../../apps/web/lib/local-analysis';

describe('public web security boundary', () => {
  it('keeps local repository analysis disabled unless both local mode and a repository root are configured', () => {
    const previousMode = process.env.DRANTIS_LOCAL_MODE;
    const previousRoot = process.env.DRANTIS_REPOSITORY_ROOT;
    const previousLegacyMode = process.env.LAUNCHPROOF_LOCAL_MODE;
    const previousLegacyRoot = process.env.LAUNCHPROOF_REPOSITORY_ROOT;
    delete process.env.DRANTIS_LOCAL_MODE;
    delete process.env.DRANTIS_REPOSITORY_ROOT;
    delete process.env.LAUNCHPROOF_LOCAL_MODE;
    delete process.env.LAUNCHPROOF_REPOSITORY_ROOT;
    expect(localAnalysisCapability().enabled).toBe(false);

    process.env.DRANTIS_LOCAL_MODE = '1';
    expect(localAnalysisCapability().enabled).toBe(false);

    process.env.DRANTIS_REPOSITORY_ROOT = '/tmp/projects';
    expect(localAnalysisCapability()).toEqual({
      enabled: true,
      repositoryRootConfigured: true,
    });

    if (previousMode === undefined) delete process.env.DRANTIS_LOCAL_MODE;
    else process.env.DRANTIS_LOCAL_MODE = previousMode;
    if (previousRoot === undefined) delete process.env.DRANTIS_REPOSITORY_ROOT;
    else process.env.DRANTIS_REPOSITORY_ROOT = previousRoot;
    if (previousLegacyMode === undefined) delete process.env.LAUNCHPROOF_LOCAL_MODE;
    else process.env.LAUNCHPROOF_LOCAL_MODE = previousLegacyMode;
    if (previousLegacyRoot === undefined) delete process.env.LAUNCHPROOF_REPOSITORY_ROOT;
    else process.env.LAUNCHPROOF_REPOSITORY_ROOT = previousLegacyRoot;
  });

  it('supports the legacy LaunchProof environment variables during migration', () => {
    const previousMode = process.env.LAUNCHPROOF_LOCAL_MODE;
    const previousRoot = process.env.LAUNCHPROOF_REPOSITORY_ROOT;
    const previousDrantisMode = process.env.DRANTIS_LOCAL_MODE;
    const previousDrantisRoot = process.env.DRANTIS_REPOSITORY_ROOT;
    delete process.env.DRANTIS_LOCAL_MODE;
    delete process.env.DRANTIS_REPOSITORY_ROOT;
    process.env.LAUNCHPROOF_LOCAL_MODE = '1';
    process.env.LAUNCHPROOF_REPOSITORY_ROOT = '/tmp/legacy-projects';
    expect(localAnalysisCapability()).toEqual({
      enabled: true,
      repositoryRootConfigured: true,
    });
    if (previousMode === undefined) delete process.env.LAUNCHPROOF_LOCAL_MODE;
    else process.env.LAUNCHPROOF_LOCAL_MODE = previousMode;
    if (previousRoot === undefined) delete process.env.LAUNCHPROOF_REPOSITORY_ROOT;
    else process.env.LAUNCHPROOF_REPOSITORY_ROOT = previousRoot;
    if (previousDrantisMode === undefined) delete process.env.DRANTIS_LOCAL_MODE;
    else process.env.DRANTIS_LOCAL_MODE = previousDrantisMode;
    if (previousDrantisRoot === undefined) delete process.env.DRANTIS_REPOSITORY_ROOT;
    else process.env.DRANTIS_REPOSITORY_ROOT = previousDrantisRoot;
  });

  it('does not trust x-forwarded-for unless the host explicitly configures that header', () => {
    const previous = process.env.LAUNCHPROOF_CLIENT_IP_HEADER;
    delete process.env.LAUNCHPROOF_CLIENT_IP_HEADER;
    const scope = `test-${Date.now()}-${Math.random()}`;
    let result = { ok: true, retryAfterSeconds: 0 };
    for (let i = 0; i < 21; i += 1) {
      result = rateLimit(
        new Request('http://localhost', { headers: { 'x-forwarded-for': `203.0.113.${i}` } }),
        scope,
      );
    }
    expect(result.ok).toBe(false);
    if (previous === undefined) delete process.env.LAUNCHPROOF_CLIENT_IP_HEADER;
    else process.env.LAUNCHPROOF_CLIENT_IP_HEADER = previous;
  });

  it('does not expose unexpected internal error messages to public callers', () => {
    expect(
      publicError(
        new Error('/srv/launchproof/private/path: secret detail'),
        'Analysis failed safely.',
      ),
    ).toBe('Analysis failed safely.');
    expect(publicError(new Error('Scenario is not authorized.'), 'Analysis failed safely.')).toBe(
      'Scenario is not authorized.',
    );
  });
});
