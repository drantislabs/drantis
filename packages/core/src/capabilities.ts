import type { LaunchProofCapabilityDocument } from '@launchproof/contracts';

export function launchProofCapabilities(): LaunchProofCapabilityDocument {
  return {
    schema: 'launchproof-capabilities/v1',
    launchProofVersion: '1.0.0-rc.1',
    surfaces: ['cli', 'web', 'desktop', 'docker'],
    commands: [
      'analyze',
      'verify',
      'report',
      'senten inspect',
      'senten verify',
      'senten keygen',
      'capabilities',
    ],
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
