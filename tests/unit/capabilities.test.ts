import { describe, expect, it } from 'vitest';
import { drantisCapabilities, launchProofCapabilities } from '@launchproof/core';

describe('Drantis capability discovery', () => {
  it('publishes the Drantis-native capability schema', () => {
    const capabilities = drantisCapabilities();
    expect(capabilities.schema).toBe('drantis-capabilities/v1');
    expect(capabilities.product).toEqual({
      name: 'Drantis',
      organization: 'Drantis Labs',
      parent: 'Rubbl Media Group',
    });
    expect(capabilities.compatibility.legacyCliAlias).toBe('launchproof');
    expect(capabilities.compatibility.sentenBridgeCommand).toBe('senten launchproof');
  });

  it('retains the pre-rename capability document for existing clients', () => {
    const legacy = launchProofCapabilities();
    expect(legacy.schema).toBe('launchproof-capabilities/v1');
    expect(legacy.launchProofVersion).toBe(drantisCapabilities().drantisVersion);
  });
});
