import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
} from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AnalysisReport,
  Analyzer,
  AnalyzerContext,
  AnalyzerOutput,
  AssuranceCase,
  Evidence,
  GraphNode,
  GraphNodeType,
  LaunchProofClaimVerificationResult,
  LaunchProofVerificationResultBundle,
  SentenAssuranceClaim,
  SentenAssuranceExchangeBundle,
  SentenEvidenceRecord,
} from '@launchproof/contracts';
import { createEvidence, stableId } from '@launchproof/evidence';

const VERSION = '1.0.0-rc.1';
const SENTEN_SCHEMA_VERSION = '0.1';
const MAX_CLAIMS = 2_000;
const MAX_EVIDENCE = 10_000;

const SENTEN_STATUSES = new Set(['declared', 'observed', 'tested', 'verified', 'unknown', 'failed']);
const SENTEN_CLAIM_KINDS = new Set(['invariant', 'policy', 'action', 'route', 'resource', 'custom']);

export function stableAssuranceJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableAssuranceJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const rows = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${rows
      .map(([key, item]) => `${JSON.stringify(key)}:${stableAssuranceJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function assuranceSha256(value: unknown): string {
  return createHash('sha256').update(stableAssuranceJson(value)).digest('hex');
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, label: string, max = 4_000): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max)
    throw new Error(`${label} must be a non-empty string no longer than ${max} characters.`);
  return value;
}

function optionalBoundedString(value: unknown, label: string, max = 4_000): string | undefined {
  if (value === undefined) return undefined;
  return boundedString(value, label, max);
}

function validateTimestamp(value: unknown, label: string): string {
  const text = boundedString(value, label, 100);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${label} is not a valid timestamp.`);
  return text;
}

function validateEvidence(row: unknown, index: number): SentenEvidenceRecord {
  const item = object(row, `Senten evidence[${index}]`);
  const status = boundedString(item.status, `Senten evidence[${index}].status`, 20);
  if (!SENTEN_STATUSES.has(status))
    throw new Error(`Unsupported Senten evidence status: ${status}`);
  const strength =
    item.strength === undefined
      ? undefined
      : typeof item.strength === 'number' &&
          Number.isInteger(item.strength) &&
          item.strength >= 0 &&
          item.strength <= 4
        ? (item.strength as 0 | 1 | 2 | 3 | 4)
        : (() => {
            throw new Error(`Senten evidence[${index}].strength must be 0..4.`);
          })();
  return {
    id: boundedString(item.id, `Senten evidence[${index}].id`, 300),
    claim: boundedString(item.claim, `Senten evidence[${index}].claim`),
    source: boundedString(item.source, `Senten evidence[${index}].source`, 1_000),
    status: status as SentenEvidenceRecord['status'],
    timestamp: validateTimestamp(item.timestamp, `Senten evidence[${index}].timestamp`),
    ...(typeof item.subject === 'string'
      ? { subject: boundedString(item.subject, `Senten evidence[${index}].subject`, 1_000) }
      : {}),
    ...(typeof item.evidenceType === 'string'
      ? {
          evidenceType: boundedString(
            item.evidenceType,
            `Senten evidence[${index}].evidenceType`,
            30,
          ) as SentenEvidenceRecord['evidenceType'],
        }
      : {}),
    ...(strength !== undefined ? { strength } : {}),
    ...(typeof item.traceId === 'string'
      ? { traceId: boundedString(item.traceId, `Senten evidence[${index}].traceId`, 300) }
      : {}),
    ...(typeof item.runtimeObservationId === 'string'
      ? {
          runtimeObservationId: boundedString(
            item.runtimeObservationId,
            `Senten evidence[${index}].runtimeObservationId`,
            300,
          ),
        }
      : {}),
    ...(typeof item.environment === 'string'
      ? {
          environment: boundedString(
            item.environment,
            `Senten evidence[${index}].environment`,
            200,
          ),
        }
      : {}),
    ...(item.provenance && typeof item.provenance === 'object' && !Array.isArray(item.provenance)
      ? { provenance: item.provenance as Record<string, unknown> }
      : {}),
    ...(item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? { metadata: item.metadata as Record<string, unknown> }
      : {}),
  };
}

function validateClaim(row: unknown, index: number): SentenAssuranceClaim {
  const item = object(row, `Senten claim[${index}]`);
  const kind = boundedString(item.kind, `Senten claim[${index}].kind`, 30);
  if (!SENTEN_CLAIM_KINDS.has(kind)) throw new Error(`Unsupported Senten claim kind: ${kind}`);
  return {
    id: boundedString(item.id, `Senten claim[${index}].id`, 300),
    subject: boundedString(item.subject, `Senten claim[${index}].subject`, 1_000),
    kind: kind as SentenAssuranceClaim['kind'],
    statement: boundedString(item.statement, `Senten claim[${index}].statement`),
    source: boundedString(item.source, `Senten claim[${index}].source`, 1_000),
    ...(item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? { metadata: item.metadata as Record<string, unknown> }
      : {}),
  };
}

export function parseSentenAssuranceExchange(content: string): SentenAssuranceExchangeBundle {
  if (Buffer.byteLength(content, 'utf8') > 10_000_000)
    throw new Error('Senten assurance exchange exceeds the 10 MB safe import limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Senten assurance exchange is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const doc = object(parsed, 'Senten assurance exchange');
  if (doc.schemaVersion !== SENTEN_SCHEMA_VERSION)
    throw new Error(`Unsupported Senten assurance schema: ${String(doc.schemaVersion)}`);
  if (doc.kind !== 'senten-assurance-exchange')
    throw new Error('Document is not a Senten assurance exchange.');
  if (!Array.isArray(doc.claims) || !Array.isArray(doc.evidence))
    throw new Error('Senten assurance exchange must contain claim and evidence arrays.');
  if (doc.claims.length > MAX_CLAIMS)
    throw new Error(`Senten assurance exchange exceeds ${MAX_CLAIMS} claims.`);
  if (doc.evidence.length > MAX_EVIDENCE)
    throw new Error(`Senten assurance exchange exceeds ${MAX_EVIDENCE} evidence records.`);

  const application = object(doc.application, 'Senten application');
  const provenance = object(doc.provenance, 'Senten assurance provenance');
  if (
    provenance.producer !== 'Senten' ||
    provenance.evidencePolicy !== 'evidence-before-ai' ||
    provenance.unknownIsPass !== false
  )
    throw new Error('Senten assurance provenance policy is unsupported or unsafe.');

  const claims = doc.claims.map(validateClaim);
  const evidence = doc.evidence.map(validateEvidence);
  const claimIds = new Set<string>();
  for (const claim of claims) {
    if (claimIds.has(claim.id)) throw new Error(`Duplicate Senten claim id: ${claim.id}`);
    claimIds.add(claim.id);
  }
  const evidenceIds = new Set<string>();
  for (const row of evidence) {
    if (evidenceIds.has(row.id)) throw new Error(`Duplicate Senten evidence id: ${row.id}`);
    evidenceIds.add(row.id);
  }

  const bundle: SentenAssuranceExchangeBundle = {
    schemaVersion: '0.1',
    kind: 'senten-assurance-exchange',
    id: boundedString(doc.id, 'Senten assurance bundle id', 300),
    generatedAt: validateTimestamp(doc.generatedAt, 'Senten assurance generatedAt'),
    sentenVersion: boundedString(doc.sentenVersion, 'Senten version', 100),
    application: {
      id: boundedString(application.id, 'Senten application id', 300),
      name: boundedString(application.name, 'Senten application name', 500),
      ...(typeof application.version === 'string'
        ? { version: boundedString(application.version, 'Senten application version', 100) }
        : {}),
    },
    stateTrussDigest: boundedString(doc.stateTrussDigest, 'StateTruss digest', 200),
    claims,
    evidence,
    provenance: {
      producer: 'Senten',
      evidencePolicy: 'evidence-before-ai',
      unknownIsPass: false,
      ...(typeof provenance.environment === 'string'
        ? {
            environment: boundedString(
              provenance.environment,
              'Senten assurance environment',
              200,
            ),
          }
        : {}),
    },
    digest: boundedString(doc.digest, 'Senten assurance digest', 200),
  };

  const { digest, ...unsigned } = bundle;
  const actual = assuranceSha256(unsigned);
  if (digest !== actual) throw new Error('Senten assurance bundle digest mismatch.');
  return bundle;
}

function graphType(kind: SentenAssuranceClaim['kind']): GraphNodeType {
  if (kind === 'invariant') return 'Invariant';
  if (kind === 'policy') return 'Policy';
  if (kind === 'route') return 'Route';
  if (kind === 'action') return 'ServerAction';
  if (kind === 'resource') return 'Service';
  return 'Module';
}

export class SentenAssuranceExchangeAnalyzer implements Analyzer {
  id = 'senten-assurance-exchange';
  version = VERSION;

  constructor(readonly bundle: SentenAssuranceExchangeBundle) {}

  analyze(context: AnalyzerContext): AnalyzerOutput {
    const evidence: Evidence[] = [];
    const graphNodes: GraphNode[] = [];
    const graphEdges: AnalyzerOutput['graphEdges'] = [];

    const receipt = createEvidence({
      kind: 'senten.assurance-exchange',
      certainty: 'DETECTED',
      title: 'Senten assurance exchange validated',
      description:
        'LaunchProof validated a digest-bound Senten assurance export. Imported Senten evidence remains upstream evidence and cannot mint LaunchProof VERIFIED certainty.',
      analyzer: { id: this.id, version: this.version },
      provenance: context.provenance,
      data: {
        bundleId: this.bundle.id,
        digest: this.bundle.digest,
        sentenVersion: this.bundle.sentenVersion,
        stateTrussDigest: this.bundle.stateTrussDigest,
        claims: this.bundle.claims.length,
        evidence: this.bundle.evidence.length,
        environment: this.bundle.provenance.environment ?? null,
      },
    });
    evidence.push(receipt);

    const boundary: GraphNode = {
      id: stableId('node', 'senten-assurance', this.bundle.id),
      type: 'ArchitectureBoundary',
      label: 'Senten Assurance Exchange',
      evidenceIds: [receipt.id],
      metadata: {
        source: 'senten',
        intended: true,
        bundleId: this.bundle.id,
        stateTrussDigest: this.bundle.stateTrussDigest,
      },
    };
    graphNodes.push(boundary);

    for (const row of this.bundle.evidence) {
      evidence.push(
        createEvidence({
          kind: `senten.assurance-evidence.${row.status}`,
          certainty: 'DETECTED',
          title: `Senten ${row.status}: ${row.subject ?? row.id}`,
          description: row.claim,
          analyzer: { id: this.id, version: this.version },
          provenance: context.provenance,
          data: {
            upstreamEvidenceId: row.id,
            subject: row.subject ?? null,
            status: row.status,
            strength: row.strength ?? null,
            source: row.source,
            evidenceType: row.evidenceType ?? null,
            environment: row.environment ?? null,
            traceId: row.traceId ?? null,
            metadataKeys: Object.keys(row.metadata ?? {}).sort(),
            provenanceKeys: Object.keys(row.provenance ?? {}).sort(),
          },
        }),
      );
    }

    for (const claim of this.bundle.claims) {
      const item = createEvidence({
        kind: 'senten.assurance-claim',
        certainty: 'DETECTED',
        title: `Senten claim: ${claim.subject}`,
        description: claim.statement,
        analyzer: { id: this.id, version: this.version },
        provenance: context.provenance,
        data: {
          upstreamClaimId: claim.id,
          subject: claim.subject,
          kind: claim.kind,
          source: claim.source,
          metadataKeys: Object.keys(claim.metadata ?? {}).sort(),
        },
      });
      evidence.push(item);
      const node: GraphNode = {
        id: stableId('senten-assurance-claim', this.bundle.id, claim.id),
        type: graphType(claim.kind),
        label: claim.subject,
        evidenceIds: [item.id],
        metadata: {
          intended: true,
          importedFrom: 'senten',
          sentenClaimId: claim.id,
          sentenSubject: claim.subject,
          sentenKind: claim.kind,
          statement: claim.statement,
        },
      };
      graphNodes.push(node);
      graphEdges?.push({
        id: stableId('senten-assurance-edge', boundary.id, node.id),
        from: boundary.id,
        to: node.id,
        type: 'DECLARES',
        evidenceIds: [item.id],
        metadata: { intended: true, importedFrom: 'senten' },
      });
    }

    return { evidence, findings: [], graphNodes, graphEdges };
  }
}

const CASE_HINTS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'AC-TENANT-001', pattern: /tenant|workspace|organization|org[-_: ]|isolation/i },
  { id: 'AC-AUTHZ-001', pattern: /authz|authorization|permission|role|access[-_: ]|admin[-_: ]/i },
  { id: 'AC-SECRETS-001', pattern: /secret|credential|api[-_: ]?key|private[-_: ]?key|token/i },
  { id: 'AC-DEPS-001', pattern: /dependency|package|supply[-_: ]?chain|vulnerab/i },
  { id: 'AC-TESTS-001', pattern: /test|journey|runtime|behavior|interaction/i },
  { id: 'AC-PRODUCTION-001', pattern: /production|deploy|observab|header|availability/i },
  { id: 'AC-AI-001', pattern: /\bai\b|model|llm|mcp|agent/i },
  { id: 'AC-PROVENANCE-001', pattern: /provenance|release|build|artifact|commit/i },
];

function mappedCase(
  claim: SentenAssuranceClaim,
  report: AnalysisReport,
): { item?: AssuranceCase; method: string } {
  const explicit = claim.metadata?.launchproofAssuranceCaseId;
  if (typeof explicit === 'string') {
    const found = report.assuranceCases.find((item) => item.id === explicit);
    if (found) return { item: found, method: 'explicit-metadata' };
  }
  const text = `${claim.subject} ${claim.statement} ${claim.kind}`;
  const hint = CASE_HINTS.find((candidate) => candidate.pattern.test(text));
  if (!hint) return { method: 'none' };
  return {
    item: report.assuranceCases.find((item) => item.id === hint.id),
    method: 'deterministic-subject-hint',
  };
}

function normalizeSubject(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[a-z-]+:/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function graphCorrespondence(claim: SentenAssuranceClaim, report: AnalysisReport): GraphNode[] {
  const target = normalizeSubject(claim.subject);
  if (!target) return [];
  return report.graph.nodes.filter((node) => {
    const values = [
      node.label,
      typeof node.metadata.sentenSubject === 'string' ? node.metadata.sentenSubject : '',
      typeof node.metadata.sentenId === 'string' ? node.metadata.sentenId : '',
      typeof node.metadata.sourcePath === 'string' ? node.metadata.sourcePath : '',
    ];
    return values.some((value) => {
      const normalized = normalizeSubject(value);
      return normalized === target || normalized.endsWith(target) || target.endsWith(normalized);
    });
  });
}

function outcomeForCase(
  item: AssuranceCase,
): Pick<LaunchProofClaimVerificationResult, 'outcome' | 'reason'> {
  if (item.state === 'VERIFIED')
    return {
      outcome: 'verified',
      reason:
        'LaunchProof independently reached VERIFIED for the mapped Assurance Case using deterministic verification evidence.',
    };
  if (item.state === 'FAILED')
    return {
      outcome: 'failed',
      reason: 'LaunchProof independently reached FAILED for the mapped Assurance Case.',
    };
  if (item.state === 'SUPPORTED' || item.state === 'PARTIAL')
    return {
      outcome: 'inconclusive',
      reason: `LaunchProof mapped this claim to ${item.id}, but the Assurance Case is ${item.state}; support is not independent verification.`,
    };
  return {
    outcome: 'unknown',
    reason: `LaunchProof mapped this claim to ${item.id}, but the Assurance Case is ${item.state}.`,
  };
}

export function createLaunchProofVerificationResult(
  bundle: SentenAssuranceExchangeBundle,
  report: AnalysisReport,
): LaunchProofVerificationResultBundle {
  const results: LaunchProofClaimVerificationResult[] = bundle.claims.map((claim) => {
    const mapped = mappedCase(claim, report);
    const nodes = graphCorrespondence(claim, report);
    const checks: NonNullable<LaunchProofClaimVerificationResult['checks']> = [
      {
        id: 'senten-bundle-integrity',
        name: 'Senten assurance exchange digest validated',
        status: 'passed',
      },
      {
        id: 'launchproof-snapshot-analysis',
        name: 'LaunchProof independently analyzed the target snapshot',
        status: 'passed',
        metadata: {
          repository: report.provenance.repository,
          commit: report.provenance.commit,
          reportId: report.id,
        },
      },
      {
        id: 'subject-correspondence',
        name: 'Claim subject correspondence',
        status: nodes.length ? 'passed' : 'unknown',
        evidenceRefs: [...new Set(nodes.flatMap((node) => node.evidenceIds))],
        metadata: { matchedNodes: nodes.map((node) => node.id) },
      },
    ];

    let decision: Pick<LaunchProofClaimVerificationResult, 'outcome' | 'reason'>;
    let evidenceRefs = [...new Set(nodes.flatMap((node) => node.evidenceIds))];

    if (mapped.item) {
      decision = outcomeForCase(mapped.item);
      evidenceRefs = [...new Set([...evidenceRefs, ...mapped.item.evidenceIds])];
      checks.push({
        id: `assurance-case:${mapped.item.id}`,
        name: `LaunchProof Assurance Case ${mapped.item.id}`,
        status:
          mapped.item.state === 'VERIFIED'
            ? 'passed'
            : mapped.item.state === 'FAILED'
              ? 'failed'
              : 'unknown',
        evidenceRefs: mapped.item.evidenceIds,
        metadata: {
          state: mapped.item.state,
          mapping: mapped.method,
          verificationEvidenceIds: mapped.item.verificationEvidenceIds ?? [],
        },
      });
    } else if (nodes.length) {
      decision = {
        outcome: 'inconclusive',
        reason:
          'LaunchProof independently observed corresponding structure, but no verified Assurance Case establishes the Senten claim.',
      };
    } else {
      decision = {
        outcome: 'unknown',
        reason:
          'LaunchProof could not map this Senten claim to an independently evaluated Assurance Case or observed graph subject.',
      };
    }

    return {
      claimId: claim.id,
      subject: claim.subject,
      ...decision,
      checks,
      evidenceRefs,
      metadata: {
        sentenClaimKind: claim.kind,
        sentenClaimSource: claim.source,
        assuranceCaseId: mapped.item?.id ?? null,
        mapping: mapped.method,
        upstreamFailedEvidence: bundle.evidence.filter(
          (row) => row.subject === claim.subject && row.status === 'failed',
        ).length,
      },
    };
  });

  return {
    schemaVersion: '0.1',
    kind: 'launchproof-verification-result',
    id: `lp_result_${createHash('sha256')
      .update(`${bundle.id}|${bundle.digest}|${report.id}`)
      .digest('hex')
      .slice(0, 16)}`,
    generatedAt: new Date().toISOString(),
    sourceBundleId: bundle.id,
    sourceBundleDigest: bundle.digest,
    verifier: {
      name: 'LaunchProof',
      version: report.provenance.launchProofVersion,
      executionId: report.id,
    },
    results,
    metadata: {
      launchProofReportId: report.id,
      repository: report.provenance.repository,
      branch: report.provenance.branch,
      commit: report.provenance.commit,
      releaseStatus: report.release.status,
      releaseScore: report.release.score,
      sentenVersion: bundle.sentenVersion,
      stateTrussDigest: bundle.stateTrussDigest,
    },
  };
}

function signingPayload(result: LaunchProofVerificationResultBundle): Buffer {
  const { signature: _signature, ...base } = result;
  return Buffer.from(stableAssuranceJson(base), 'utf8');
}

export function signLaunchProofVerificationResult(
  result: LaunchProofVerificationResultBundle,
  privateKey: string,
  publisher = 'launchproof',
): LaunchProofVerificationResultBundle {
  const publicKey = createPublicKey(privateKey)
    .export({ format: 'pem', type: 'spki' })
    .toString();
  const keyId = `ed25519:${createHash('sha256').update(publicKey).digest('hex').slice(0, 24)}`;
  const payload = signingPayload(result);
  return {
    ...result,
    signature: {
      algorithm: 'ed25519',
      keyId,
      publisher,
      publicKey,
      signature: cryptoSign(null, payload, privateKey).toString('base64'),
      signedDigest: createHash('sha256').update(payload).digest('hex'),
      createdAt: new Date().toISOString(),
    },
  };
}

export async function generateLaunchProofSigningKey(
  outputDirectory: string,
  publisher = 'launchproof',
): Promise<{ privateKeyPath: string; publicKeyPath: string; keyId: string }> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  });
  const keyId = `ed25519:${createHash('sha256').update(publicKey).digest('hex').slice(0, 24)}`;
  const directory = path.resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  const suffix = keyId.slice(-8);
  const privateKeyPath = path.join(directory, `${publisher}-${suffix}.private.pem`);
  const publicKeyPath = path.join(directory, `${publisher}-${suffix}.public.pem`);
  await writeFile(privateKeyPath, privateKey, { mode: 0o600 });
  await writeFile(publicKeyPath, publicKey);
  return { privateKeyPath, publicKeyPath, keyId };
}
