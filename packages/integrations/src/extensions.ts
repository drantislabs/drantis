import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerOutput,
  AssuranceClaim,
  Evidence,
  EvidenceImporter,
  EvidenceInterchangeEnvelope,
  ExtensionCapability,
  ExtensionManifest,
  GraphEdge,
  GraphNode,
  PlatformAdapter,
  RepositorySnapshot,
} from '@launchproof/contracts';
import { createEvidence, stableId } from '@launchproof/evidence';

const VERSION = '1.0.0-rc.1';
const MANIFEST_API = 'launchproof.dev/v1' as const;
const EVIDENCE_SCHEMA = 'launchproof-evidence/v1' as const;
const EXTENSION_ID = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const CAPABILITIES = new Set<ExtensionCapability>([
  'language-detection',
  'framework-detection',
  'platform-detection',
  'architecture',
  'policy',
  'invariants',
  'evidence',
  'graph',
  'controls',
  'runtime-verification',
  'scanner-import',
  'reporting',
]);

export function validateExtensionManifest(manifest: ExtensionManifest): ExtensionManifest {
  if (manifest.apiVersion !== MANIFEST_API)
    throw new Error(`Unsupported Drantis extension API: ${String(manifest.apiVersion)}`);
  if (!EXTENSION_ID.test(manifest.metadata.id))
    throw new Error(`Invalid extension id: ${manifest.metadata.id}`);
  if (!manifest.metadata.version.trim()) throw new Error('Extension version is required.');
  if (!manifest.compatibility.core.trim())
    throw new Error('Extension core compatibility range is required.');
  if (!manifest.capabilities.length)
    throw new Error('Extension must declare at least one capability.');
  for (const capability of manifest.capabilities)
    if (!CAPABILITIES.has(capability))
      throw new Error(`Unknown extension capability: ${String(capability)}`);
  return manifest;
}

export class ExtensionRegistry<T extends { manifest: ExtensionManifest }> {
  private readonly entries = new Map<string, T>();
  register(extension: T): void {
    validateExtensionManifest(extension.manifest);
    const id = extension.manifest.metadata.id;
    if (this.entries.has(id)) throw new Error(`Duplicate extension id: ${id}`);
    this.entries.set(id, extension);
  }
  get(id: string): T | undefined {
    return this.entries.get(id);
  }
  list(): readonly T[] {
    return [...this.entries.values()];
  }
}

const GRAPH_NODE_TYPES = new Set([
  'Route',
  'Middleware',
  'ServerAction',
  'AuthenticationBoundary',
  'AuthorizationPolicy',
  'ValidationBoundary',
  'RateLimit',
  'Service',
  'Repository',
  'Database',
  'Table',
  'RLSPolicy',
  'Storage',
  'ExternalAPI',
  'AIProvider',
  'Secret',
  'Queue',
  'UserRole',
  'EnvironmentVariable',
  'Test',
  'Deployment',
  'Module',
  'ArchitectureBoundary',
  'Policy',
  'Invariant',
  'Extension',
]);
const GRAPH_EDGE_TYPES = new Set([
  'CALLS',
  'READS',
  'WRITES',
  'AUTHENTICATES_THROUGH',
  'AUTHORIZED_BY',
  'VALIDATED_BY',
  'RATE_LIMITED_BY',
  'DEPENDS_ON',
  'EXPOSES',
  'TRUSTS',
  'TESTED_BY',
  'DEPLOYED_BY',
  'DECLARES',
  'CONSTRAINS',
  'VIOLATES',
  'IMPLEMENTS',
]);

function parseObject(content: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must contain a JSON object.`);
  return value as Record<string, unknown>;
}

function safeImportedSource(
  source: unknown,
): import('@launchproof/contracts').SourceLocation | undefined {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const raw = source as Record<string, unknown>;
  if (
    typeof raw.path !== 'string' ||
    raw.path.length < 1 ||
    raw.path.length > 500 ||
    raw.path.includes('\0')
  )
    throw new Error('Imported evidence source path is invalid.');
  const normalized = raw.path.replaceAll('\\', '/');
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  )
    throw new Error('Imported evidence source path must stay within the analyzed repository.');
  const numeric = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
  const line = numeric(raw.line);
  const column = numeric(raw.column);
  const endLine = numeric(raw.endLine);
  const endColumn = numeric(raw.endColumn);
  return {
    path: normalized,
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
    ...(endLine !== undefined ? { endLine } : {}),
    ...(endColumn !== undefined ? { endColumn } : {}),
  };
}

function certaintyFromExternal(value: unknown): Evidence['certainty'] {
  // External producers can provide evidence, but only Drantis-authorized isolated verification can create VERIFIED guarantees.
  if (value === 'INFERRED' || value === 'VERIFIED') return 'INFERRED';
  return 'DETECTED';
}

export class LaunchProofEvidenceImporter implements EvidenceImporter {
  manifest: ExtensionManifest = validateExtensionManifest({
    apiVersion: MANIFEST_API,
    kind: 'EvidenceImporter',
    metadata: {
      id: 'launchproof-evidence-v1',
      version: VERSION,
      displayName: 'Drantis Legacy Evidence Interchange v1',
      vendor: 'Drantis',
    },
    capabilities: ['evidence', 'graph', 'invariants'],
    compatibility: { core: '>=1.0.0-rc.1 <2.0.0' },
  });

  supports(source: { path?: string; mediaType?: string; schema?: string }): boolean {
    return (
      source.schema === EVIDENCE_SCHEMA ||
      source.path?.endsWith('launchproof-evidence.json') === true ||
      source.mediaType === 'application/vnd.launchproof.evidence+json'
    );
  }

  import(content: string, context: AnalyzerContext): AnalyzerOutput {
    const doc = parseObject(
      content,
      'Evidence interchange document',
    ) as unknown as EvidenceInterchangeEnvelope;
    if (doc.schema !== EVIDENCE_SCHEMA)
      throw new Error(
        `Unsupported evidence interchange schema: ${String((doc as { schema?: unknown }).schema)}`,
      );
    if (!doc.producer?.id || !doc.producer?.version)
      throw new Error('Evidence interchange producer id and version are required.');
    if (!EXTENSION_ID.test(doc.producer.id) || doc.producer.version.length > 100)
      throw new Error('Evidence interchange producer identity is invalid.');
    if (!doc.repository?.commit)
      throw new Error('Evidence interchange repository commit is required.');
    if (
      context.snapshot.commit !== 'WORKTREE' &&
      doc.repository.commit !== context.snapshot.commit
    ) {
      throw new Error(
        `Evidence commit ${doc.repository.commit} does not match analyzed snapshot ${context.snapshot.commit}.`,
      );
    }
    if (!Array.isArray(doc.evidence))
      throw new Error('Evidence interchange evidence must be an array.');
    if (doc.claims !== undefined && !Array.isArray(doc.claims))
      throw new Error('Evidence interchange claims must be an array.');
    if (
      doc.graph !== undefined &&
      (!doc.graph ||
        typeof doc.graph !== 'object' ||
        !Array.isArray(doc.graph.nodes) ||
        !Array.isArray(doc.graph.edges))
    )
      throw new Error('Evidence interchange graph must contain node and edge arrays.');
    if (doc.evidence.length > 10_000)
      throw new Error('Evidence interchange exceeds the maximum evidence item count (10000).');
    if ((doc.claims?.length ?? 0) > 2_000)
      throw new Error('Evidence interchange exceeds the maximum claim count (2000).');
    if ((doc.graph?.nodes.length ?? 0) > 20_000 || (doc.graph?.edges.length ?? 0) > 50_000)
      throw new Error('Evidence interchange graph exceeds safe size limits.');

    const evidence: Evidence[] = [];
    const idMap = new Map<string, string>();
    for (const upstream of doc.evidence) {
      if (!upstream?.id || !upstream.kind || !upstream.title || !upstream.description)
        throw new Error('Imported evidence is missing required fields.');
      if (
        upstream.id.length > 200 ||
        upstream.kind.length > 200 ||
        upstream.title.length > 500 ||
        upstream.description.length > 4_000
      )
        throw new Error('Imported evidence field exceeds safe length limits.');
      const importedSource = upstream.source ? safeImportedSource(upstream.source) : undefined;
      const item = createEvidence({
        kind: `imported.${upstream.kind}`,
        certainty: certaintyFromExternal(upstream.certainty),
        title: upstream.title,
        description: upstream.description,
        analyzer: { id: doc.producer.id, version: doc.producer.version },
        provenance: context.provenance,
        ...(importedSource ? { source: importedSource } : {}),
        data: {
          upstreamEvidenceId: upstream.id,
          upstreamCertainty: upstream.certainty,
          generatedAt: doc.generatedAt,
          payload: upstream.data,
        },
      });
      evidence.push(item);
      idMap.set(upstream.id, item.id);
    }

    for (const claim of doc.claims ?? [])
      evidence.push(this.claimEvidence(claim, doc, context, idMap));

    const graphNodes: GraphNode[] = [];
    const graphEdges: GraphEdge[] = [];
    const graphIdMap = new Map<string, string>();
    for (const node of doc.graph?.nodes ?? []) {
      if (
        !GRAPH_NODE_TYPES.has(node.type) ||
        typeof node.id !== 'string' ||
        node.id.length > 300 ||
        typeof node.label !== 'string' ||
        node.label.length > 500
      )
        continue;
      const id = stableId('imported-node', doc.producer.id, node.id);
      graphIdMap.set(node.id, id);
      graphNodes.push({
        ...node,
        id,
        evidenceIds: node.evidenceIds
          .map((evidenceId) => idMap.get(evidenceId))
          .filter((evidenceId): evidenceId is string => Boolean(evidenceId)),
        metadata: { ...node.metadata, importedFrom: doc.producer.id, upstreamNodeId: node.id },
      });
    }
    for (const edge of doc.graph?.edges ?? []) {
      if (!GRAPH_EDGE_TYPES.has(edge.type)) continue;
      const from = graphIdMap.get(edge.from);
      const to = graphIdMap.get(edge.to);
      if (!from || !to) continue;
      graphEdges.push({
        ...edge,
        id: stableId('imported-edge', doc.producer.id, edge.id),
        from,
        to,
        evidenceIds: edge.evidenceIds
          .map((evidenceId) => idMap.get(evidenceId))
          .filter((evidenceId): evidenceId is string => Boolean(evidenceId)),
        metadata: {
          ...(edge.metadata ?? {}),
          importedFrom: doc.producer.id,
          upstreamEdgeId: edge.id,
        },
      });
    }
    return { evidence, findings: [], graphNodes, graphEdges };
  }

  private claimEvidence(
    claim: AssuranceClaim,
    doc: EvidenceInterchangeEnvelope,
    context: AnalyzerContext,
    idMap: Map<string, string>,
  ): Evidence {
    if (!claim?.id || !claim.statement || !claim.subject)
      throw new Error('Imported assurance claim is missing required fields.');
    return createEvidence({
      kind: 'imported.assurance-claim',
      certainty: certaintyFromExternal(claim.certainty),
      title: `Imported claim: ${claim.subject}`,
      description: claim.statement,
      analyzer: { id: doc.producer.id, version: doc.producer.version },
      provenance: context.provenance,
      data: {
        upstreamClaimId: claim.id,
        scope: claim.scope ?? [],
        upstreamEvidenceIds: claim.evidenceIds ?? [],
        launchProofEvidenceIds: (claim.evidenceIds ?? [])
          .map((id) => idMap.get(id))
          .filter(Boolean),
        upstreamCertainty: claim.certainty,
        metadata: claim.metadata ?? {},
      },
    });
  }
}

export const sentenManifest: ExtensionManifest = validateExtensionManifest({
  apiVersion: MANIFEST_API,
  kind: 'PlatformAdapter',
  metadata: { id: 'senten', version: VERSION, displayName: 'Senten', vendor: 'ThomasDSCX Labs' },
  capabilities: ['platform-detection', 'architecture', 'policy', 'invariants', 'evidence', 'graph'],
  compatibility: { core: '>=1.0.0-rc.1 <2.0.0' },
});

function packageDeclaresSenten(snapshot: RepositorySnapshot): boolean {
  const pkg = snapshot.files.get('package.json');
  if (!pkg) return false;
  try {
    const parsed = JSON.parse(pkg) as Record<string, any>;
    const deps = {
      ...(parsed.dependencies ?? {}),
      ...(parsed.devDependencies ?? {}),
      ...(parsed.peerDependencies ?? {}),
    };
    return Object.keys(deps).some((name) => name === 'senten' || name.startsWith('@senten/'));
  } catch {
    return false;
  }
}

function sentenArchitecture(snapshot: RepositorySnapshot): string | undefined {
  return snapshot.files.get('senten.architecture.json');
}
function sentenEvidenceFile(
  snapshot: RepositorySnapshot,
): { path: string; content: string } | undefined {
  for (const path of ['.senten/launchproof-evidence.json', 'senten.launchproof-evidence.json']) {
    const content = snapshot.files.get(path);
    if (content) return { path, content };
  }
  return undefined;
}
function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}
function nestedObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function textField(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const found = value[key];
    if (typeof found === 'string' && found.trim()) return found.trim();
  }
  return undefined;
}

class SentenAnalyzer implements Analyzer {
  id = 'platform-senten';
  version = VERSION;
  private readonly importer = new LaunchProofEvidenceImporter();

  analyze(context: AnalyzerContext): AnalyzerOutput {
    const evidence: Evidence[] = [];
    const graphNodes: GraphNode[] = [];
    const graphEdges: GraphEdge[] = [];
    const detectedBy = [
      sentenArchitecture(context.snapshot) ? 'senten.architecture.json' : undefined,
      packageDeclaresSenten(context.snapshot) ? 'package.json' : undefined,
    ].filter(Boolean);
    const detected = createEvidence({
      kind: 'platform.senten',
      certainty: 'DETECTED',
      title: 'Senten project detected',
      description:
        'LaunchProof detected Senten from a parsed package declaration or Senten architecture declaration.',
      analyzer: { id: this.id, version: this.version },
      provenance: context.provenance,
      data: {
        detectedBy,
        adapterApi: sentenManifest.apiVersion,
        capabilities: sentenManifest.capabilities,
      },
    });
    evidence.push(detected);
    const boundary: GraphNode = {
      id: stableId('node', 'senten', 'intended-architecture'),
      type: 'ArchitectureBoundary',
      label: 'Senten Intended Architecture',
      evidenceIds: [detected.id],
      metadata: { source: 'senten', intended: true },
    };
    graphNodes.push(boundary);

    const architectureContent = sentenArchitecture(context.snapshot);
    if (architectureContent)
      this.readArchitecture(
        architectureContent,
        context,
        boundary,
        evidence,
        graphNodes,
        graphEdges,
      );

    const imported = sentenEvidenceFile(context.snapshot);
    if (imported) {
      const output = this.importer.import(imported.content, context);
      evidence.push(...output.evidence);
      graphNodes.push(...(output.graphNodes ?? []));
      graphEdges.push(...(output.graphEdges ?? []));
      const importEvidence = createEvidence({
        kind: 'senten.evidence-import',
        certainty: 'DETECTED',
        title: 'Senten evidence interchange imported',
        description:
          'A versioned LaunchProof evidence envelope produced by Senten was validated and normalized. Upstream VERIFIED claims are not promoted to Drantis VERIFIED.',
        analyzer: { id: this.id, version: this.version },
        provenance: context.provenance,
        source: { path: imported.path },
        data: {
          schema: EVIDENCE_SCHEMA,
          normalizedEvidence: output.evidence.length,
          graphNodes: output.graphNodes?.length ?? 0,
          graphEdges: output.graphEdges?.length ?? 0,
        },
      });
      evidence.push(importEvidence);
      boundary.evidenceIds.push(importEvidence.id);
    }
    return { evidence, findings: [], graphNodes, graphEdges };
  }

  private readArchitecture(
    content: string,
    context: AnalyzerContext,
    boundary: GraphNode,
    evidence: Evidence[],
    graphNodes: GraphNode[],
    graphEdges: GraphEdge[],
  ): void {
    const doc = parseObject(content, 'senten.architecture.json');
    const architecture = nestedObject(doc.architecture);
    const architectureEvidence = createEvidence({
      kind: 'senten.architecture-declaration',
      certainty: 'DETECTED',
      title: 'Senten architecture declaration discovered',
      description:
        'Drantis parsed Senten intended-architecture metadata without executing Senten or repository code.',
      analyzer: { id: this.id, version: this.version },
      provenance: context.provenance,
      source: { path: 'senten.architecture.json' },
      data: {
        schema: doc.schema ?? doc.apiVersion ?? null,
        version: doc.version ?? null,
        topLevelKeys: Object.keys(doc).sort(),
      },
    });
    evidence.push(architectureEvidence);
    boundary.evidenceIds.push(architectureEvidence.id);

    const componentRows = [
      ...objectArray(doc.modules),
      ...objectArray(doc.components),
      ...objectArray(doc.nodes),
      ...objectArray(architecture.modules),
      ...objectArray(architecture.components),
      ...objectArray(architecture.nodes),
    ];
    const componentIds = new Map<string, GraphNode>();
    for (const row of componentRows) {
      const key = textField(row, ['id', 'name', 'key']);
      if (!key || componentIds.has(key)) continue;
      const node: GraphNode = {
        id: stableId('senten-node', key),
        type: 'Module',
        label: textField(row, ['name', 'label', 'id']) ?? key,
        evidenceIds: [architectureEvidence.id],
        metadata: {
          intended: true,
          sentenId: key,
          sentenType: textField(row, ['type', 'kind']) ?? 'module',
        },
      };
      graphNodes.push(node);
      componentIds.set(key, node);
      graphEdges.push({
        id: stableId('senten-edge', boundary.id, node.id, 'DECLARES'),
        from: boundary.id,
        to: node.id,
        type: 'DECLARES',
        evidenceIds: [architectureEvidence.id],
        metadata: { intended: true },
      });
    }

    const relationshipRows = [
      ...objectArray(doc.relationships),
      ...objectArray(doc.edges),
      ...objectArray(doc.dependencies),
      ...objectArray(architecture.relationships),
      ...objectArray(architecture.edges),
      ...objectArray(architecture.dependencies),
    ];
    for (const row of relationshipRows) {
      const from = textField(row, ['from', 'source', 'caller']);
      const to = textField(row, ['to', 'target', 'callee', 'dependency']);
      if (!from || !to) continue;
      const a = componentIds.get(from),
        b = componentIds.get(to);
      if (!a || !b) continue;
      graphEdges.push({
        id: stableId('senten-edge', a.id, b.id, 'DEPENDS_ON'),
        from: a.id,
        to: b.id,
        type: 'DEPENDS_ON',
        evidenceIds: [architectureEvidence.id],
        metadata: {
          intended: true,
          sentenRelationship: textField(row, ['type', 'kind', 'relationship']) ?? 'dependency',
        },
      });
    }

    const invariantRows = [
      ...objectArray(doc.invariants),
      ...objectArray(doc.rules),
      ...objectArray(doc.policies),
      ...objectArray(architecture.invariants),
      ...objectArray(architecture.rules),
      ...objectArray(architecture.policies),
    ];
    for (const [index, row] of invariantRows.entries()) {
      const id = textField(row, ['id', 'name', 'key']) ?? `invariant-${index + 1}`;
      const statement = textField(row, ['statement', 'description', 'rule', 'claim', 'name']) ?? id;
      const item = createEvidence({
        kind: 'senten.invariant-declaration',
        certainty: 'DETECTED',
        title: `Senten invariant: ${id}`,
        description: statement,
        analyzer: { id: this.id, version: this.version },
        provenance: context.provenance,
        source: { path: 'senten.architecture.json' },
        data: { id, intended: true, kind: textField(row, ['type', 'kind']) ?? 'invariant' },
      });
      evidence.push(item);
      const node: GraphNode = {
        id: stableId('senten-invariant', id),
        type: 'Invariant',
        label: id,
        evidenceIds: [item.id],
        metadata: { intended: true, statement },
      };
      graphNodes.push(node);
      graphEdges.push({
        id: stableId('senten-edge', boundary.id, node.id, 'DECLARES'),
        from: boundary.id,
        to: node.id,
        type: 'DECLARES',
        evidenceIds: [item.id],
        metadata: { intended: true },
      });
    }
  }
}

export class SentenPlatformAdapter implements PlatformAdapter {
  manifest = sentenManifest;
  detect(snapshot: RepositorySnapshot): boolean {
    return Boolean(
      sentenArchitecture(snapshot) ||
      sentenEvidenceFile(snapshot) ||
      packageDeclaresSenten(snapshot),
    );
  }
  analyzer(): Analyzer {
    return new SentenAnalyzer();
  }
}

export function analyzersFromPlatformAdapters(
  snapshot: RepositorySnapshot,
  adapters: PlatformAdapter[],
): Analyzer[] {
  return adapters
    .filter((adapter) => adapter.detect(snapshot))
    .map((adapter) => adapter.analyzer());
}
