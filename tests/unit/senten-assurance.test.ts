import { createHash, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  AnalysisReport,
  SentenAssuranceExchangeBundle,
} from '@launchproof/contracts';
import {
  assuranceSha256,
  createLaunchProofVerificationResult,
  parseSentenAssuranceExchange,
  signLaunchProofVerificationResult,
  stableAssuranceJson,
} from '@launchproof/integrations';

function bundle(): SentenAssuranceExchangeBundle {
  const base = {
    schemaVersion: '0.1' as const,
    kind: 'senten-assurance-exchange' as const,
    id: 'asx_fixture',
    generatedAt: '2026-09-29T12:00:00.000Z',
    sentenVersion: '1.0.3',
    application: { id: 'app', name: 'Fixture' },
    stateTrussDigest: 'abc123',
    claims: [
      {
        id: 'claim_tenant',
        subject: 'invariant:tenant-isolation',
        kind: 'invariant' as const,
        statement: 'Invariant Tenant isolation remains true.',
        source: 'state-truss',
      },
    ],
    evidence: [],
    provenance: {
      producer: 'Senten' as const,
      evidencePolicy: 'evidence-before-ai' as const,
      unknownIsPass: false as const,
      environment: 'test',
    },
  };
  return { ...base, digest: assuranceSha256(base) };
}

function report(state: AnalysisReport['assuranceCases'][number]['state']): AnalysisReport {
  return {
    id: 'lp_report_1',
    provenance: {
      repository: 'fixture',
      branch: 'main',
      commit: 'abc',
      analyzedAt: '2026-09-29T12:01:00.000Z',
      launchProofVersion: '1.0.0-rc.1',
      policyVersion: '1',
    },
    evidence: [
      {
        id: 'ev_verified',
        kind: 'verification.tenant',
        certainty: 'VERIFIED',
        title: 'Tenant verification',
        description: 'Deterministic tenant verification completed.',
        analyzer: { id: 'test', version: '1' },
        provenance: {
          repository: 'fixture',
          branch: 'main',
          commit: 'abc',
          analyzedAt: '2026-09-29T12:01:00.000Z',
          launchProofVersion: '1.0.0-rc.1',
          policyVersion: '1',
        },
        data: {},
      },
    ],
    findings: [],
    graph: {
      nodes: [
        {
          id: 'tenant-node',
          type: 'Invariant',
          label: 'tenant-isolation',
          evidenceIds: ['ev_verified'],
          metadata: {},
        },
      ],
      edges: [],
    },
    controls: [],
    assuranceCases: [
      {
        id: 'AC-TENANT-001',
        claim: 'Tenant isolation',
        state,
        controlIds: [],
        evidenceIds: ['ev_verified'],
        rationale: ['fixture'],
        verificationEvidenceIds: state === 'VERIFIED' ? ['ev_verified'] : [],
      },
    ],
    release: {
      score: 90,
      status: 'READY_WITH_CONDITIONS',
      domainScores: [],
      blockers: [],
      conditions: [],
      explanation: [],
      coverage: 90,
    },
    limitations: [],
  };
}

describe('Senten 1.0.3 assurance protocol', () => {
  it('validates the digest-bound Senten assurance exchange', () => {
    const value = bundle();
    expect(parseSentenAssuranceExchange(JSON.stringify(value))).toEqual(value);
    expect(() =>
      parseSentenAssuranceExchange(JSON.stringify({ ...value, stateTrussDigest: 'tampered' })),
    ).toThrow(/digest mismatch/i);
  });

  it('only emits verified when the mapped LaunchProof Assurance Case is VERIFIED', () => {
    expect(createLaunchProofVerificationResult(bundle(), report('VERIFIED')).results[0]?.outcome).toBe(
      'verified',
    );
    expect(createLaunchProofVerificationResult(bundle(), report('SUPPORTED')).results[0]?.outcome).toBe(
      'inconclusive',
    );
  });

  it('signs results using the exact Senten stable-json Ed25519 payload contract', async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
      publicKeyEncoding: { format: 'pem', type: 'spki' },
    });
    const signed = signLaunchProofVerificationResult(
      createLaunchProofVerificationResult(bundle(), report('VERIFIED')),
      privateKey,
    );
    const { signature, ...unsigned } = signed;
    expect(signature?.algorithm).toBe('ed25519');
    const payload = Buffer.from(stableAssuranceJson(unsigned), 'utf8');
    expect(createHash('sha256').update(payload).digest('hex')).toBe(signature?.signedDigest);
    expect(
      verify(null, payload, signature!.publicKey, Buffer.from(signature!.signature, 'base64')),
    ).toBe(true);
  });
});
