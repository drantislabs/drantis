export const CERTAINTIES = ['DETECTED', 'INFERRED', 'VERIFIED'] as const;
export type Certainty = (typeof CERTAINTIES)[number];
export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const ASSURANCE_DOMAINS = [
  'security',
  'quality',
  'architecture',
  'testing',
  'accessibility',
  'production',
] as const;
export type AssuranceDomain = (typeof ASSURANCE_DOMAINS)[number];
export const AI_DATA_POLICIES = [
  'evidence-only',
  'relevant-context',
  'extended-context',
  'local-only',
] as const;
export type AIDataPolicy = (typeof AI_DATA_POLICIES)[number];

export const EXTENSION_CAPABILITIES = [
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
] as const;
export type ExtensionCapability = (typeof EXTENSION_CAPABILITIES)[number];
export type ExtensionKind =
  | 'AnalyzerExtension'
  | 'LanguageAdapter'
  | 'FrameworkAdapter'
  | 'PlatformAdapter'
  | 'EvidenceImporter'
  | 'Reporter';
export interface ExtensionManifest {
  apiVersion: 'drantis.dev/v1' | 'launchproof.dev/v1';
  kind: ExtensionKind;
  metadata: { id: string; version: string; displayName?: string; vendor?: string };
  capabilities: ExtensionCapability[];
  compatibility: { core: string };
}

export interface AssuranceClaim {
  id: string;
  subject: string;
  statement: string;
  scope: string[];
  evidenceIds: string[];
  producer: AnalyzerIdentity;
  certainty: Certainty;
  metadata?: Record<string, unknown>;
}

export interface EvidenceInterchangeEnvelope {
  schema: 'drantis-evidence/v1' | 'launchproof-evidence/v1';
  producer: AnalyzerIdentity & { name?: string };
  repository: { name?: string; branch?: string; commit: string };
  generatedAt: string;
  evidence: Array<Omit<Evidence, 'provenance' | 'analyzer'>>;
  claims?: AssuranceClaim[];
  graph?: ApplicationGraph;
}

export type SentenEvidenceStatus =
  | 'declared'
  | 'observed'
  | 'tested'
  | 'verified'
  | 'unknown'
  | 'failed';

export interface SentenEvidenceRecord {
  id: string;
  claim: string;
  source: string;
  status: SentenEvidenceStatus;
  timestamp: string;
  subject?: string;
  evidenceType?: 'declaration' | 'runtime' | 'test' | 'verification' | 'interaction' | 'manual';
  strength?: 0 | 1 | 2 | 3 | 4;
  traceId?: string;
  runtimeObservationId?: string;
  environment?: string;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SentenAssuranceClaim {
  id: string;
  subject: string;
  kind: 'invariant' | 'policy' | 'action' | 'route' | 'resource' | 'custom';
  statement: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface SentenAssuranceExchangeBundle {
  schemaVersion: '0.1';
  kind: 'senten-assurance-exchange';
  id: string;
  generatedAt: string;
  sentenVersion: string;
  application: { id: string; name: string; version?: string };
  stateTrussDigest: string;
  claims: SentenAssuranceClaim[];
  evidence: SentenEvidenceRecord[];
  provenance: {
    producer: 'Senten';
    evidencePolicy: 'evidence-before-ai';
    unknownIsPass: false;
    environment?: string;
  };
  digest: string;
}

export interface LaunchProofClaimVerificationResult {
  claimId: string;
  subject: string;
  outcome: 'verified' | 'failed' | 'unknown' | 'inconclusive';
  reason?: string;
  checks?: Array<{
    id: string;
    name?: string;
    status: 'passed' | 'failed' | 'unknown';
    evidenceRefs?: string[];
    metadata?: Record<string, unknown>;
  }>;
  evidenceRefs?: string[];
  metadata?: Record<string, unknown>;
}

export interface LaunchProofVerificationResultBundle {
  schemaVersion: '0.1';
  kind: 'launchproof-verification-result';
  id: string;
  generatedAt: string;
  sourceBundleId: string;
  sourceBundleDigest: string;
  verifier: { name: 'LaunchProof'; version?: string; executionId?: string };
  results: LaunchProofClaimVerificationResult[];
  signature?: {
    algorithm: 'ed25519';
    keyId: string;
    publisher?: string;
    publicKey: string;
    signature: string;
    signedDigest: string;
    createdAt: string;
  };
  metadata?: Record<string, unknown>;
}

export interface DrantisCapabilityDocument {
  schema: 'drantis-capabilities/v1';
  drantisVersion: string;
  product: {
    name: 'Drantis';
    organization: 'Drantis Labs';
    parent: 'Rubbl Media Group';
  };
  surfaces: Array<'cli' | 'web' | 'desktop' | 'docker'>;
  commands: string[];
  protocols: {
    genericEvidence: 'drantis-evidence/v1';
    sentenAssuranceExchange: '0.1';
    sentenVerificationResult: 'launchproof-verification-result/0.1';
    sarif: '2.1.0';
  };
  integrations: {
    senten: {
      targetVersion: string;
      exportCommand: string;
      importCommand: string;
      trustCommand: string;
    };
    lobework: {
      status: 'contract-ready' | 'planned';
      transport: string;
    };
  };
  compatibility: {
    legacyCapabilitySchema: 'launchproof-capabilities/v1';
    legacyGenericEvidenceSchema: 'launchproof-evidence/v1';
    legacyExtensionApi: 'launchproof.dev/v1';
    legacyCliAlias: 'launchproof';
    sentenBridgeCommand: 'senten launchproof';
  };
}

/** @deprecated Compatibility document for pre-Drantis clients. */
export interface LaunchProofCapabilityDocument {
  schema: 'launchproof-capabilities/v1';
  launchProofVersion: string;
  surfaces: Array<'cli' | 'web' | 'desktop' | 'docker'>;
  commands: string[];
  protocols: {
    genericEvidence: 'launchproof-evidence/v1';
    sentenAssuranceExchange: '0.1';
    launchProofVerificationResult: '0.1';
    sarif: '2.1.0';
  };
  integrations: {
    senten: {
      targetVersion: string;
      exportCommand: string;
      importCommand: string;
      trustCommand: string;
    };
    lobework: {
      status: 'contract-ready' | 'planned';
      transport: string;
    };
  };
}

export interface VerificationCommandPolicy {
  id: string;
  command: string;
  args?: string[] | undefined;
  purpose: string;
  timeoutMs?: number | undefined;
  network?: 'none' | 'restricted' | undefined;
  image?: string | undefined;
}

export interface DrantisPolicyShape {
  version: 1;
  analysis?: { excludePaths?: string[] };
  assurance: { requiredDomains: AssuranceDomain[] };
  security: {
    failOnSeverity: Severity;
    requireNoDetectedSecrets: boolean;
    requireAuthorizationForProtectedRoutes?: boolean;
    requireRateLimitForPublicMutation?: boolean;
  };
  tenancy: { required: boolean; requireRls?: boolean };
  testing: { requireTestFiles: boolean; requireVerifiedTests?: boolean };
  production: {
    requireReleaseProvenance: boolean;
    requireSecurityHeaders?: boolean;
    requireObservability?: boolean;
  };
  releaseGates: {
    blockOnFailedAssuranceCase: boolean;
    blockOnCriticalFinding: boolean;
    minimumScore?: number;
    minimumCoverage?: number;
  };
  ai: { dataPolicy: AIDataPolicy; allowedProviders?: string[] };
  verification?: { enabled: boolean; commands: VerificationCommandPolicy[] };
}

/** @deprecated Use DrantisPolicyShape for new integrations. */
export type LaunchProofPolicyShape = DrantisPolicyShape;

export interface SourceLocation {
  path: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface AnalyzerIdentity {
  id: string;
  version: string;
}

export interface AnalysisProvenance {
  repository: string;
  branch: string;
  commit: string;
  analyzedAt: string;
  launchProofVersion: string;
  policyVersion: string;
  analyzers?: AnalyzerIdentity[];
}

export interface Evidence<T = unknown> {
  id: string;
  kind: string;
  certainty: Certainty;
  title: string;
  description: string;
  analyzer: AnalyzerIdentity;
  provenance: AnalysisProvenance;
  source?: SourceLocation;
  data: T;
  fingerprints?: string[];
}

export interface Finding {
  id: string;
  ruleId: string;
  title: string;
  domain: AssuranceDomain;
  severity: Severity;
  confidence: number;
  status: 'open' | 'resolved' | 'accepted';
  source?: SourceLocation;
  evidenceIds: string[];
  cwe?: string[];
  owasp?: string[];
  affectedComponents: string[];
  graphPaths: string[][];
  explanation: string;
  impact: string;
  remediation: string;
  analyzer: AnalyzerIdentity;
}

export type GraphNodeType =
  | 'Route'
  | 'Middleware'
  | 'ServerAction'
  | 'AuthenticationBoundary'
  | 'AuthorizationPolicy'
  | 'ValidationBoundary'
  | 'RateLimit'
  | 'Service'
  | 'Repository'
  | 'Database'
  | 'Table'
  | 'RLSPolicy'
  | 'Storage'
  | 'ExternalAPI'
  | 'AIProvider'
  | 'Secret'
  | 'Queue'
  | 'UserRole'
  | 'EnvironmentVariable'
  | 'Test'
  | 'Deployment'
  | 'Module'
  | 'ArchitectureBoundary'
  | 'Policy'
  | 'Invariant'
  | 'Extension';

export type GraphRelationshipType =
  | 'CALLS'
  | 'READS'
  | 'WRITES'
  | 'AUTHENTICATES_THROUGH'
  | 'AUTHORIZED_BY'
  | 'VALIDATED_BY'
  | 'RATE_LIMITED_BY'
  | 'DEPENDS_ON'
  | 'EXPOSES'
  | 'TRUSTS'
  | 'TESTED_BY'
  | 'DEPLOYED_BY'
  | 'DECLARES'
  | 'CONSTRAINS'
  | 'VIOLATES'
  | 'IMPLEMENTS';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  evidenceIds: string[];
  metadata: Record<string, unknown>;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: GraphRelationshipType;
  evidenceIds: string[];
  metadata?: Record<string, unknown>;
}
export interface ApplicationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type ControlOutcome = 'PASS' | 'FAIL' | 'PARTIAL' | 'UNKNOWN';
export interface ControlDefinition {
  id: string;
  title: string;
  domain: AssuranceDomain;
  description: string;
  version: string;
  weight?: number;
  severityOnFailure?: Severity;
}
export interface ControlResult {
  control: ControlDefinition;
  outcome: ControlOutcome;
  evidenceIds: string[];
  findingIds: string[];
  rationale: string;
  coverage?: number;
}

export type AssuranceCaseState =
  'VERIFIED' | 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED' | 'FAILED' | 'UNKNOWN';
export interface AssuranceCase {
  id: string;
  claim: string;
  state: AssuranceCaseState;
  controlIds: string[];
  evidenceIds: string[];
  rationale: string[];
  requiredEvidenceKinds?: string[];
  verificationEvidenceIds?: string[];
}

export type ReleaseStatus =
  'READY' | 'READY_WITH_CONDITIONS' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'INCOMPLETE';
export interface DomainScore {
  domain: AssuranceDomain;
  score: number;
  coverage: number;
}
export interface ReleaseDecision {
  score: number;
  status: ReleaseStatus;
  domainScores: DomainScore[];
  blockers: string[];
  conditions: string[];
  explanation: string[];
  coverage?: number;
}

export type AnalysisPhase =
  | 'provenance'
  | 'analyzers'
  | 'graph'
  | 'verification'
  | 'controls'
  | 'assurance'
  | 'scoring'
  | 'complete';
export interface AnalysisProgressEvent {
  phase: AnalysisPhase;
  message: string;
  completed: number;
  total: number;
  analyzerId?: string;
}

export interface AnalysisReport {
  id: string;
  provenance: AnalysisProvenance;
  evidence: Evidence[];
  findings: Finding[];
  graph: ApplicationGraph;
  controls: ControlResult[];
  assuranceCases: AssuranceCase[];
  release: ReleaseDecision;
  limitations: string[];
}

export interface RepositorySnapshot {
  root: string;
  repository: string;
  branch: string;
  commit: string;
  files: ReadonlyMap<string, string>;
  stats?: {
    fileCount: number;
    totalBytes: number;
    scannedEntries?: number;
    skippedSymlinks: number;
    skippedOversize: number;
  };
}
export interface AnalyzerContext {
  snapshot: RepositorySnapshot;
  provenance: AnalysisProvenance;
}
export interface AnalyzerOutput {
  evidence: Evidence[];
  findings: Finding[];
  graphNodes?: GraphNode[];
  graphEdges?: GraphEdge[];
}
export interface Analyzer {
  id: string;
  version: string;
  analyze(context: AnalyzerContext): Promise<AnalyzerOutput> | AnalyzerOutput;
}

export interface EvidenceProducer {
  id: string;
  version: string;
  produce(context: AnalyzerContext): Promise<Evidence[]> | Evidence[];
}
export interface LanguageAdapter {
  manifest: ExtensionManifest;
  detect(snapshot: RepositorySnapshot): boolean;
  analyzer(): Analyzer;
}
export interface FrameworkAdapter {
  id: string;
  version: string;
  manifest?: ExtensionManifest;
  detect(snapshot: RepositorySnapshot): boolean;
  analyzer(): Analyzer;
}
export interface PlatformAdapter {
  manifest: ExtensionManifest;
  detect(snapshot: RepositorySnapshot): boolean;
  analyzer(): Analyzer;
}
export interface EvidenceImporter {
  manifest: ExtensionManifest;
  supports(source: { path?: string; mediaType?: string; schema?: string }): boolean;
  import(content: string, context: AnalyzerContext): AnalyzerOutput;
}
export interface Reporter {
  id: string;
  version: string;
  mediaType: string;
  render(report: AnalysisReport): string | Uint8Array;
}

export interface ScannerResultInput {
  scanner: string;
  scannerVersion?: string;
  format: string;
  content: string;
}
export interface ScannerAdapter {
  id: string;
  version: string;
  supports(format: string): boolean;
  normalize(input: ScannerResultInput, context: AnalyzerContext): AnalyzerOutput;
}

export interface ExecutionRequest {
  snapshot: RepositorySnapshot;
  command: string;
  args?: string[];
  purpose: string;
  timeoutMs: number;
  network: 'none' | 'restricted';
  image?: string;
  authorizationToken?: string;
}
export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  timedOut?: boolean;
  runner: string;
  image?: string;
}
export interface IsolatedRunner {
  id: string;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
export interface IntelligenceInput {
  evidence: Evidence[];
  findings: Finding[];
  graph: ApplicationGraph;
  assuranceCases: AssuranceCase[];
  prompt: string;
  sourceExcerpts?: Array<{ path: string; content: string }>;
}
export interface IntelligenceOutput {
  text: string;
  referencedEvidenceIds: string[];
}
export interface IntelligenceProvider {
  id: string;
  local: boolean;
  generate(input: IntelligenceInput): Promise<IntelligenceOutput>;
}

export interface PublicAssuranceReport {
  schemaVersion: 1;
  reportId: string;
  repository: string;
  branch: string;
  commit: string;
  analyzedAt: string;
  launchProofVersion: string;
  release: Pick<ReleaseDecision, 'score' | 'status' | 'domainScores' | 'coverage'>;
  assuranceCases: Array<Pick<AssuranceCase, 'id' | 'claim' | 'state'>>;
  findingSummary: Record<Severity, number>;
  disclaimer: string;
}

export interface ReportComparison {
  before: { reportId: string; score: number; status: ReleaseStatus };
  after: { reportId: string; score: number; status: ReleaseStatus };
  changedControls: Array<{ id: string; before: ControlOutcome; after: ControlOutcome }>;
  changedAssuranceCases: Array<{
    id: string;
    before: AssuranceCaseState;
    after: AssuranceCaseState;
  }>;
  addedFindingIds: string[];
  resolvedFindingIds: string[];
  addedEvidenceKinds: string[];
  removedEvidenceKinds: string[];
}
