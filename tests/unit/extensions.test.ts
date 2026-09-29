import { describe, expect, it } from 'vitest';
import type {
  AnalyzerContext,
  EvidenceInterchangeEnvelope,
  RepositorySnapshot,
} from '@launchproof/core';
import {
  LaunchProofEvidenceImporter,
  SentenPlatformAdapter,
  validateExtensionManifest,
} from '@launchproof/integrations';

function context(snapshot: RepositorySnapshot): AnalyzerContext {
  return {
    snapshot,
    provenance: {
      repository: snapshot.repository,
      branch: snapshot.branch,
      commit: snapshot.commit,
      analyzedAt: '2026-09-17T00:00:00Z',
      launchProofVersion: '1.0.0-rc.1',
      policyVersion: '1',
    },
  };
}

function snapshot(files: Record<string, string>, commit = 'abc123'): RepositorySnapshot {
  return {
    root: '/repo',
    repository: 'senten-demo',
    branch: 'main',
    commit,
    files: new Map(Object.entries(files)),
  };
}

describe('extension contracts', () => {
  it('rejects unknown extension capabilities', () => {
    expect(() =>
      validateExtensionManifest({
        apiVersion: 'launchproof.dev/v1',
        kind: 'PlatformAdapter',
        metadata: { id: 'bad-extension', version: '1.0.0' },
        capabilities: ['architecture', 'made-up' as never],
        compatibility: { core: '>=0.2 <1.0' },
      }),
    ).toThrow(/unknown extension capability/i);
  });

  it('detects Senten only from structured project declarations and renders intended architecture', () => {
    const repo = snapshot({
      'package.json': JSON.stringify({ devDependencies: { senten: '1.0.3' } }),
      'senten.architecture.json': JSON.stringify({
        modules: [
          { id: 'cli', name: 'CLI' },
          { id: 'core', name: 'Core' },
        ],
        dependencies: [{ from: 'cli', to: 'core', type: 'uses' }],
        invariants: [
          { id: 'boundary', statement: 'CLI depends on Core through the declared boundary.' },
        ],
      }),
    });
    const adapter = new SentenPlatformAdapter();
    expect(adapter.detect(repo)).toBe(true);
    const output = adapter.analyzer().analyze(context(repo)) as any;
    expect(output.evidence.some((item) => item.kind === 'senten.architecture-declaration')).toBe(
      true,
    );
    expect(output.graphNodes?.some((item) => item.type === 'ArchitectureBoundary')).toBe(true);
    expect(output.graphNodes?.filter((item) => item.type === 'Module')).toHaveLength(2);
    expect(output.graphEdges?.some((item) => item.type === 'DEPENDS_ON')).toBe(true);
  });

  it('does not detect Senten from an arbitrary README mention', () => {
    const adapter = new SentenPlatformAdapter();
    expect(
      adapter.detect(snapshot({ 'README.md': 'This project compares itself to Senten.' })),
    ).toBe(false);
  });
});

describe('evidence interchange', () => {
  const envelope = (commit = 'abc123'): EvidenceInterchangeEnvelope => ({
    schema: 'launchproof-evidence/v1',
    producer: { id: 'senten', version: '1.0.3' },
    repository: { name: 'demo', branch: 'main', commit },
    generatedAt: '2026-09-17T00:00:00Z',
    evidence: [
      {
        id: 'senten-ev-1',
        kind: 'senten.invariant-result',
        certainty: 'VERIFIED',
        title: 'Invariant satisfied',
        description: 'Senten reports its invariant passed.',
        data: { invariant: 'boundary' },
      },
    ],
    claims: [
      {
        id: 'senten-claim-1',
        subject: 'architecture',
        statement: 'Declared architecture is satisfied.',
        scope: ['architecture'],
        evidenceIds: ['senten-ev-1'],
        producer: { id: 'senten', version: '1.0.3' },
        certainty: 'VERIFIED',
      },
    ],
  });

  it('downgrades upstream VERIFIED evidence because imported tools cannot mint LaunchProof verification', () => {
    const repo = snapshot({});
    const output = new LaunchProofEvidenceImporter().import(
      JSON.stringify(envelope()),
      context(repo),
    );
    expect(
      output.evidence.find((item) => item.kind === 'imported.senten.invariant-result')?.certainty,
    ).toBe('INFERRED');
    expect(
      output.evidence.find((item) => item.kind === 'imported.assurance-claim')?.certainty,
    ).toBe('INFERRED');
    expect(output.evidence.some((item) => item.certainty === 'VERIFIED')).toBe(false);
  });

  it('rejects evidence generated for another commit', () => {
    const repo = snapshot({}, 'expected');
    expect(() =>
      new LaunchProofEvidenceImporter().import(
        JSON.stringify(envelope('different')),
        context(repo),
      ),
    ).toThrow(/does not match analyzed snapshot/i);
  });

  it('rejects imported source paths that escape the repository', () => {
    const repo = snapshot({});
    const doc = envelope();
    doc.evidence[0] = { ...doc.evidence[0]!, source: { path: '../outside.txt' } };
    expect(() =>
      new LaunchProofEvidenceImporter().import(JSON.stringify(doc), context(repo)),
    ).toThrow(/stay within the analyzed repository/i);
  });

  it('namespaces imported graph ids to prevent collisions with observed graph nodes', () => {
    const repo = snapshot({});
    const doc = envelope();
    doc.graph = {
      nodes: [
        {
          id: 'node_route_collision',
          type: 'Module',
          label: 'Senten module',
          evidenceIds: ['senten-ev-1'],
          metadata: {},
        },
      ],
      edges: [],
    };
    const output = new LaunchProofEvidenceImporter().import(JSON.stringify(doc), context(repo));
    expect(output.graphNodes?.[0]?.id).not.toBe('node_route_collision');
    expect(output.graphNodes?.[0]?.metadata.upstreamNodeId).toBe('node_route_collision');
  });
});
