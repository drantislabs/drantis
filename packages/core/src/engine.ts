import type {
  AnalysisProvenance,
  AnalysisReport,
  Analyzer,
  Evidence,
  IsolatedRunner,
  LaunchProofPolicyShape,
  ReportComparison,
  PublicAssuranceReport,
  AnalysisProgressEvent,
  RepositorySnapshot,
  VerificationCommandPolicy,
} from '@launchproof/contracts';
import { createEvidence, stableId } from '@launchproof/evidence';
import { ApplicationGraphBuilder } from '@launchproof/graph';
import { evaluateControls, buildAssuranceCases } from '@launchproof/assurance';
import { calculateReleaseDecision } from '@launchproof/scoring';

function redactVerificationOutput(input: string): string {
  return input
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_OPENAI_KEY]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_ACCESS_KEY]')
    .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      '[REDACTED_PRIVATE_KEY]',
    )
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}\b/gi, '$1[REDACTED_TOKEN]')
    .replace(
      /\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|SUPABASE_SERVICE_ROLE_KEY|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY)\s*=\s*([^\s]+)/gi,
      '$1=[REDACTED]',
    );
}

function verificationEvidence(
  provenance: AnalysisProvenance,
  version: string,
  command: VerificationCommandPolicy,
  result: Awaited<ReturnType<IsolatedRunner['execute']>>,
): Evidence {
  return createEvidence({
    kind: `verification.${command.id}`,
    certainty: 'VERIFIED',
    title: `Verification command ${command.id} completed`,
    description:
      'A deterministic command was executed by an explicitly authorized isolated runner.',
    analyzer: { id: `runner:${result.runner}`, version },
    provenance,
    data: {
      command: command.command,
      args: command.args ?? [],
      purpose: command.purpose,
      exitCode: result.exitCode,
      timedOut: Boolean(result.timedOut),
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      image: result.image,
      stdoutBytes: Buffer.byteLength(result.stdout, 'utf8'),
      stderrBytes: Buffer.byteLength(result.stderr, 'utf8'),
      stdoutTail: redactVerificationOutput(result.stdout).slice(-4000),
      stderrTail: redactVerificationOutput(result.stderr).slice(-4000),
    },
  });
}

export async function analyzeSnapshot(
  snapshot: RepositorySnapshot,
  policy: LaunchProofPolicyShape,
  analyzers: Analyzer[],
  version = '1.0.0-rc.1',
  options: {
    runner?: IsolatedRunner;
    authorizeDynamicVerification?: boolean;
    onProgress?: (event: AnalysisProgressEvent) => void | Promise<void>;
  } = {},
): Promise<AnalysisReport> {
  const totalPhases = 7 + analyzers.length;
  let progress = 0;
  const emit = async (
    phase: AnalysisProgressEvent['phase'],
    message: string,
    analyzerId?: string,
  ) => {
    progress += 1;
    await options.onProgress?.({
      phase,
      message,
      completed: progress,
      total: totalPhases,
      ...(analyzerId ? { analyzerId } : {}),
    });
  };
  const provenance: AnalysisProvenance = {
    repository: snapshot.repository,
    branch: snapshot.branch,
    commit: snapshot.commit,
    analyzedAt: new Date().toISOString(),
    launchProofVersion: version,
    policyVersion: String(policy.version),
    analyzers: analyzers.map(({ id, version: analyzerVersion }) => ({
      id,
      version: analyzerVersion,
    })),
  };

  const provenanceEvidence = createEvidence({
    kind: 'analysis.provenance',
    certainty: 'DETECTED',
    title: 'Analysis provenance recorded',
    description:
      'Drantis recorded repository, commit, policy, analyzer identities, and analysis version.',
    analyzer: { id: 'drantis-core', version },
    provenance,
    data: {
      repository: snapshot.repository,
      branch: snapshot.branch,
      commit: snapshot.commit,
      policyVersion: policy.version,
      analyzers: provenance.analyzers,
      snapshotStats: snapshot.stats,
    },
  });

  await emit('provenance', 'Repository identity and analysis provenance recorded.');

  const evidence: Evidence[] = [provenanceEvidence];
  const findings = [];
  const graphBuilder = new ApplicationGraphBuilder();
  const pendingEdges = [];

  for (const analyzer of analyzers) {
    const output = await analyzer.analyze({ snapshot, provenance });
    await emit('analyzers', `Analyzer ${analyzer.id} completed.`, analyzer.id);
    evidence.push(...output.evidence);
    findings.push(...output.findings);
    for (const node of output.graphNodes ?? []) graphBuilder.addNode(node);
    pendingEdges.push(...(output.graphEdges ?? []));
  }

  for (const edge of pendingEdges) {
    try {
      graphBuilder.addEdge(edge);
    } catch {
      // Analyzers can deduplicate nodes independently. Invalid edges are intentionally dropped
      // rather than corrupting the graph; analyzer tests assert expected edge integrity.
    }
  }

  if (policy.verification?.enabled) {
    if (!options.authorizeDynamicVerification) {
      evidence.push(
        createEvidence({
          kind: 'verification.authorization-missing',
          certainty: 'DETECTED',
          title: 'Dynamic verification not authorized',
          description:
            'Policy requests verification, but this analysis invocation did not explicitly authorize code execution.',
          analyzer: { id: 'drantis-core', version },
          provenance,
          data: { commandCount: policy.verification.commands.length },
        }),
      );
    } else if (!options.runner) {
      throw new Error('Dynamic verification was authorized but no isolated runner was configured.');
    } else {
      for (const command of policy.verification.commands) {
        const result = await options.runner.execute({
          snapshot,
          command: command.command,
          ...(command.args ? { args: command.args } : {}),
          purpose: command.purpose,
          timeoutMs: command.timeoutMs ?? 120_000,
          network: command.network ?? 'none',
          ...(command.image ? { image: command.image } : {}),
          authorizationToken: 'explicit-analysis-authorization',
        });
        evidence.push(verificationEvidence(provenance, version, command, result));
      }
    }
  }

  await emit(
    'verification',
    policy.verification?.enabled
      ? 'Dynamic verification policy evaluated.'
      : 'Dynamic verification is disabled for this analysis.',
  );

  const graph = graphBuilder.build();
  await emit(
    'graph',
    `Application Security Graph constructed with ${graph.nodes.length} nodes and ${graph.edges.length} edges.`,
  );
  const controls = evaluateControls(evidence, findings, graph, policy);
  await emit('controls', `${controls.length} Drantis Build Standard controls evaluated.`);
  const assuranceCases = buildAssuranceCases(evidence, controls, findings, graph, policy);
  await emit('assurance', `${assuranceCases.length} Assurance Cases constructed.`);
  const release = calculateReleaseDecision(controls, assuranceCases, findings, policy);
  await emit('scoring', `Release decision ${release.status} calculated deterministically.`);

  await options.onProgress?.({
    phase: 'complete',
    message: 'Analysis report complete.',
    completed: totalPhases,
    total: totalPhases,
  });

  return {
    id: stableId('report', snapshot.repository, snapshot.commit, provenance.analyzedAt),
    provenance,
    evidence,
    findings,
    graph,
    controls,
    assuranceCases,
    release,
    limitations: [
      'Static evidence can support security claims but cannot prove runtime behavior.',
      'Only configured isolated-runner verification produces VERIFIED evidence.',
      'Scanner coverage depends on scanner result adapters and supplied scanner outputs.',
      'Absence of a supported secret signature is not proof that no secret exists.',
      'Drantis reports are snapshot-specific assurance evidence, not permanent security certification.',
    ],
  };
}

export function sanitizePublicReport(report: AnalysisReport): PublicAssuranceReport {
  const findingSummary = { info: 0, low: 0, medium: 0, high: 0, critical: 0 } as Record<
    import('./index.js').Severity,
    number
  >;
  for (const finding of report.findings)
    if (finding.status === 'open') findingSummary[finding.severity] += 1;
  return {
    schemaVersion: 1,
    reportId: report.id,
    repository: report.provenance.repository,
    branch: report.provenance.branch,
    commit: report.provenance.commit,
    analyzedAt: report.provenance.analyzedAt,
    launchProofVersion: report.provenance.launchProofVersion,
    release: {
      score: report.release.score,
      status: report.release.status,
      domainScores: report.release.domainScores,
      ...(report.release.coverage !== undefined ? { coverage: report.release.coverage } : {}),
    },
    assuranceCases: report.assuranceCases.map(({ id, claim, state }) => ({ id, claim, state })),
    findingSummary,
    disclaimer:
      'Snapshot-specific software assurance evidence. Not permanent security certification or a guarantee of absence of vulnerabilities.',
  };
}

export function compareReports(before: AnalysisReport, after: AnalysisReport): ReportComparison {
  const beforeControls = new Map(before.controls.map((item) => [item.control.id, item.outcome]));
  const afterControls = new Map(after.controls.map((item) => [item.control.id, item.outcome]));
  const changedControls = [...new Set([...beforeControls.keys(), ...afterControls.keys()])]
    .filter((id) => beforeControls.get(id) !== afterControls.get(id))
    .map((id) => ({
      id,
      before: beforeControls.get(id) ?? 'UNKNOWN',
      after: afterControls.get(id) ?? 'UNKNOWN',
    }));

  const beforeCases = new Map(before.assuranceCases.map((item) => [item.id, item.state]));
  const afterCases = new Map(after.assuranceCases.map((item) => [item.id, item.state]));
  const changedAssuranceCases = [...new Set([...beforeCases.keys(), ...afterCases.keys()])]
    .filter((id) => beforeCases.get(id) !== afterCases.get(id))
    .map((id) => ({
      id,
      before: beforeCases.get(id) ?? 'UNKNOWN',
      after: afterCases.get(id) ?? 'UNKNOWN',
    }));

  const beforeFindings = new Set(
    before.findings.filter((item) => item.status === 'open').map((item) => item.id),
  );
  const afterFindings = new Set(
    after.findings.filter((item) => item.status === 'open').map((item) => item.id),
  );
  const beforeKinds = new Set(before.evidence.map((item) => item.kind));
  const afterKinds = new Set(after.evidence.map((item) => item.kind));

  return {
    before: { reportId: before.id, score: before.release.score, status: before.release.status },
    after: { reportId: after.id, score: after.release.score, status: after.release.status },
    changedControls,
    changedAssuranceCases,
    addedFindingIds: [...afterFindings].filter((id) => !beforeFindings.has(id)),
    resolvedFindingIds: [...beforeFindings].filter((id) => !afterFindings.has(id)),
    addedEvidenceKinds: [...afterKinds].filter((kind) => !beforeKinds.has(kind)),
    removedEvidenceKinds: [...beforeKinds].filter((kind) => !afterKinds.has(kind)),
  };
}
