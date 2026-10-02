import type {
  DrantisCapabilityDocument,
  LaunchProofCapabilityDocument,
} from '@launchproof/contracts';

const VERSION = '1.0.0-rc.1';

const surfaces = ['cli', 'web', 'desktop', 'docker'] as const;
const commands = [
  'analyze',
  'verify',
  'report',
  'senten inspect',
  'senten verify',
  'senten keygen',
  'capabilities',
] as const;

export function drantisCapabilities(): DrantisCapabilityDocument {
  return {
    schema: 'drantis-capabilities/v1',
    drantisVersion: VERSION,
    product: {
      name: 'Drantis',
      organization: 'Drantis Labs',
      parent: 'Rubbl Media Group',
    },
    surfaces: [...surfaces],
    commands: [...commands],
    protocols: {
      genericEvidence: 'drantis-evidence/v1',
      sentenAssuranceExchange: '0.1',
      sentenVerificationResult: 'launchproof-verification-result/0.1',
      sarif: '2.1.0',
    },
    integrations: {
      senten: {
        targetVersion: '1.0.3',
        exportCommand: 'senten launchproof export',
        importCommand: 'senten launchproof import <result.json>',
        trustCommand: 'senten trust add <launchproof.public.pem> --publisher launchproof',
      },
      lobework: {
        status: 'contract-ready',
        transport: 'capabilities-and-report-contracts',
      },
    },
    compatibility: {
      legacyCapabilitySchema: 'launchproof-capabilities/v1',
      legacyGenericEvidenceSchema: 'launchproof-evidence/v1',
      legacyExtensionApi: 'launchproof.dev/v1',
      legacyCliAlias: 'launchproof',
      sentenBridgeCommand: 'senten launchproof',
    },
  };
}

/** @deprecated Use drantisCapabilities for new clients. */
export function launchProofCapabilities(): LaunchProofCapabilityDocument {
  return {
    schema: 'launchproof-capabilities/v1',
    launchProofVersion: VERSION,
    surfaces: [...surfaces],
    commands: [...commands],
    protocols: {
      genericEvidence: 'launchproof-evidence/v1',
      sentenAssuranceExchange: '0.1',
      launchProofVerificationResult: '0.1',
      sarif: '2.1.0',
    },
    integrations: {
      senten: {
        targetVersion: '1.0.3',
        exportCommand: 'senten launchproof export',
        importCommand: 'senten launchproof import <result.json>',
        trustCommand: 'senten trust add <launchproof.public.pem> --publisher launchproof',
      },
      lobework: {
        status: 'contract-ready',
        transport: 'capabilities-and-report-contracts',
      },
    },
  };
}
