'use client';
import { useEffect, useMemo, useState } from 'react';
import type {
  AnalysisProgressEvent,
  AnalysisReport,
  GraphNode,
  ReportComparison,
} from '@launchproof/core';

const stages = ['Discover', 'Inspect', 'Map', 'Controls', 'Assurance', 'Decision'];
type View =
  | 'overview'
  | 'system'
  | 'senten'
  | 'cases'
  | 'findings'
  | 'evidence'
  | 'controls'
  | 'history'
  | 'intelligence'
  | 'settings';

const stageForPhase: Record<AnalysisProgressEvent['phase'], number> = {
  provenance: 0,
  analyzers: 1,
  verification: 1,
  graph: 2,
  controls: 3,
  assurance: 4,
  scoring: 5,
  complete: 5,
};

export function DrantisApp() {
  const [scenario, setScenario] = useState('production-reference');
  const [analysisSource, setAnalysisSource] = useState<'showcase' | 'local'>('showcase');
  const [localPath, setLocalPath] = useState('.');
  const [localModeAvailable, setLocalModeAvailable] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [view, setView] = useState<View>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<{
    before: AnalysisReport;
    after: AnalysisReport;
    comparison: ReportComparison;
  } | null>(null);
  const [progress, setProgress] = useState<AnalysisProgressEvent | null>(null);
  const [history, setHistory] = useState<AnalysisReport[]>([]);

  useEffect(() => {
    fetch('/api/capabilities')
      .then((response) => response.json())
      .then((body) => setLocalModeAvailable(Boolean(body?.runtime?.localAnalysis?.enabled ?? body?.localAnalysis?.enabled)))
      .catch(() => setLocalModeAvailable(false));
  }, []);

  async function analyze() {
    setBusy(true);
    setError('');
    setReport(null);
    setComparison(null);
    setProgress(null);
    try {
      const local = analysisSource === 'local';
      const response = await fetch(local ? '/api/local-analyze-stream' : '/api/analyze-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(local ? { repositoryPath: localPath } : { scenario }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Analysis failed');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalReport: AnalysisReport | null = null;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line) as {
            type: string;
            event?: AnalysisProgressEvent;
            report?: AnalysisReport;
            error?: string;
          };
          if (message.type === 'progress' && message.event) setProgress(message.event);
          if (message.type === 'report' && message.report) finalReport = message.report;
          if (message.type === 'error') throw new Error(message.error ?? 'Analysis failed');
        }
        if (done) break;
      }
      if (!finalReport) throw new Error('Analysis stream ended without a report.');
      setReport(finalReport);
      setHistory((items) =>
        [finalReport!, ...items.filter((item) => item.id !== finalReport!.id)].slice(0, 12),
      );
      setView('overview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  }

  async function compareRegression() {
    setBusy(true);
    setError('');
    setComparison(null);
    setProgress(null);
    try {
      const response = await fetch('/api/compare', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Comparison failed');
      setComparison(body);
      setReport(body.after);
      setHistory((items) =>
        [
          body.after,
          body.before,
          ...items.filter((item) => item.id !== body.after.id && item.id !== body.before.id),
        ].slice(0, 12),
      );
      setView('overview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Comparison failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="top">
        <div className="brand">
          <span className="mark">DR</span>
          <div>
            <strong>Drantis</strong>
            <small>Drantis Labs / A Rubbl Media Group company</small>
          </div>
        </div>
        <div className="principle">
          Evidence before AI <span>•</span> Unknown ≠ Passed
        </div>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">SOFTWARE ASSURANCE / APPLICATION SECURITY</p>
          <h1>
            Build <i>→</i> Inspect <i>→</i> Prove <i>→</i> Ship.
          </h1>
          <p>
            Drantis establishes what evidence actually exists that software is ready to release.
            Deterministic analysis drives every control, claim and release gate; AI can explain
            evidence, never manufacture a pass.
          </p>
        </div>
        <div className="analyze-card">
          <div className="source-switch" aria-label="Analysis source">
            <button
              type="button"
              className={analysisSource === 'showcase' ? 'selected' : ''}
              onClick={() => setAnalysisSource('showcase')}
              disabled={busy}
            >
              Showcase
            </button>
            <button
              type="button"
              className={analysisSource === 'local' ? 'selected' : ''}
              onClick={() => setAnalysisSource('local')}
              disabled={busy || !localModeAvailable}
              title={
                localModeAvailable
                  ? 'Analyze a repository below the configured local repository root.'
                  : 'Enable DRANTIS_LOCAL_MODE and DRANTIS_REPOSITORY_ROOT on a self-hosted instance.'
              }
            >
              Local repository
            </button>
          </div>
          {analysisSource === 'showcase' ? (
            <label>
              AUTHORIZED SHOWCASE TARGET
              <select
                value={scenario}
                onChange={(event) => setScenario(event.target.value)}
                disabled={busy}
              >
                <option value="production-reference">Pipeline — Production Reference</option>
                <option value="missing-tenant-authorization">
                  Pipeline — Missing Tenant Authorization
                </option>
                <option value="drantis-self">Drantis — Self Analysis</option>
                <option value="senten-reference">Senten — Integration Contract</option>
              </select>
            </label>
          ) : (
            <label>
              REPOSITORY PATH UNDER CONFIGURED ROOT
              <input
                value={localPath}
                onChange={(event) => setLocalPath(event.target.value)}
                disabled={busy}
                placeholder="project-name or ."
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}
          <button onClick={analyze} disabled={busy}>
            {busy ? 'Establishing evidence…' : 'Start deterministic analysis'}
          </button>
          <button className="secondary" onClick={compareRegression} disabled={busy}>
            Compare reference ↔ regression
          </button>
          <small>
            Static inspection never executes repository scripts, tests, builds, binaries or
            Dockerfiles. Local web analysis is available only when the self-hosted server explicitly
            enables it and confines paths below a configured repository root.
          </small>
        </div>
      </section>
      <section className="stages">
        {stages.map((stage, index) => {
          const active =
            busy && progress ? stageForPhase[progress.phase] === index : busy && index === 0;
          const done = progress
            ? stageForPhase[progress.phase] > index || progress.phase === 'complete'
            : false;
          return (
            <div key={stage} className={active ? 'active' : done ? 'done' : ''}>
              <b>{String(index + 1).padStart(2, '0')}</b>
              <span>{stage}</span>
            </div>
          );
        })}
      </section>
      {error && <div className="error">{error}</div>}
      {!report && !busy && (
        <section className="empty">
          <div className="radar">
            <span />
            <span />
            <span />
          </div>
          <h2>Ready to establish evidence.</h2>
          <p>
            Select an explicitly authorized snapshot. The report below is generated from the actual
            source artifacts Drantis can observe.
          </p>
        </section>
      )}
      {busy && (
        <section className="empty">
          <div className="scanline" />
          <h2>{progress?.message ?? 'Inspecting hostile input without executing it.'}</h2>
          <p>
            {progress
              ? `${progress.completed} / ${progress.total} analysis stages completed · ${progress.phase}`
              : 'Repository contents are bounded, symlinks are skipped, oversized input is constrained, and static analysis remains separate from authorized isolated verification.'}
          </p>
        </section>
      )}
      {comparison && <ComparisonBanner data={comparison.comparison} />}
      {report && <Report report={report} view={view} setView={setView} history={history} />}
    </main>
  );
}

function ComparisonBanner({ data }: { data: ReportComparison }) {
  return (
    <section className="comparison">
      <div>
        <p className="eyebrow">CONTROLLED REGRESSION</p>
        <h2>
          {data.before.score} → {data.after.score}
        </h2>
        <span>
          {data.before.status.replaceAll('_', ' ')} → {data.after.status.replaceAll('_', ' ')}
        </span>
      </div>
      <div className="change-grid">
        <article>
          <b>{data.changedControls.length}</b>
          <span>changed controls</span>
        </article>
        <article>
          <b>{data.changedAssuranceCases.length}</b>
          <span>changed assurance cases</span>
        </article>
        <article>
          <b>{data.addedFindingIds.length}</b>
          <span>new findings</span>
        </article>
        <article>
          <b>{data.removedEvidenceKinds.length}</b>
          <span>lost evidence kinds</span>
        </article>
      </div>
    </section>
  );
}

function exportReport(report: AnalysisReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `launchproof-${report.provenance.commit || 'worktree'}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function Report({
  report,
  view,
  setView,
  history,
}: {
  report: AnalysisReport;
  view: View;
  setView: (view: View) => void;
  history: AnalysisReport[];
}) {
  return (
    <div className="report">
      <nav className="report-nav">
        {(
          [
            'overview',
            'system',
            'senten',
            'cases',
            'findings',
            'evidence',
            'controls',
            'history',
            'intelligence',
            'settings',
          ] as View[]
        ).map((item) => (
          <button
            className={view === item ? 'selected' : ''}
            onClick={() => setView(item)}
            key={item}
          >
            {item}
          </button>
        ))}
        <button className="export-report" onClick={() => exportReport(report)}>
          export JSON
        </button>
      </nav>
      {view === 'overview' && <Overview report={report} />}
      {view === 'system' && <SystemMap report={report} />}
      {view === 'senten' && <SentenView report={report} />}
      {view === 'cases' && <AssuranceExplorer report={report} />}
      {view === 'findings' && <Findings report={report} />}
      {view === 'evidence' && <EvidenceLedger report={report} />}
      {view === 'controls' && <Controls report={report} />}
      {view === 'history' && <History current={report} history={history} />}
      {view === 'intelligence' && <Intelligence report={report} />}
      {view === 'settings' && <Settings report={report} />}
      <footer>
        <span>{report.provenance.repository}</span>
        <code>{report.provenance.commit}</code>
        <span>{new Date(report.provenance.analyzedAt).toLocaleString()}</span>
        <span>Drantis {report.provenance.launchProofVersion}</span>
        <span>{report.provenance.analyzers?.length ?? 0} analyzer(s)</span>
      </footer>
    </div>
  );
}

function Overview({ report }: { report: AnalysisReport }) {
  return (
    <>
      <section className="decision">
        <div>
          <p className="eyebrow">RELEASE DECISION</p>
          <div className={`status ${report.release.status.toLowerCase()}`}>
            {report.release.status.replaceAll('_', ' ')}
          </div>
          <h2>
            {report.release.score}
            <span>/100</span>
          </h2>
          <p>{report.release.explanation[0]}</p>
          <small>{report.release.coverage ?? 0}% overall evaluated control coverage</small>
        </div>
        <div className="domain-grid">
          {report.release.domainScores.map((domain) => (
            <article key={domain.domain}>
              <div>
                <span>{domain.domain}</span>
                <b>{domain.score}</b>
              </div>
              <progress value={domain.score} max="100" />
              <small>{domain.coverage}% control coverage</small>
            </article>
          ))}
        </div>
      </section>
      {(report.release.blockers.length > 0 || report.release.conditions.length > 0) && (
        <section className="gates">
          <h3>Release gates</h3>
          {report.release.blockers.map((item) => (
            <div className="gate block" key={item}>
              <b>BLOCK</b>
              <span>{item}</span>
            </div>
          ))}
          {report.release.conditions.map((item) => (
            <div className="gate condition" key={item}>
              <b>CONDITION</b>
              <span>{item}</span>
            </div>
          ))}
        </section>
      )}
      <DecisionExplainer report={report} />
      <section className="metric-row">
        <article>
          <span>Evidence</span>
          <b>{report.evidence.length}</b>
        </article>
        <article>
          <span>Findings</span>
          <b>{report.findings.filter((item) => item.status === 'open').length}</b>
        </article>
        <article>
          <span>Graph nodes</span>
          <b>{report.graph.nodes.length}</b>
        </article>
        <article>
          <span>Trust edges</span>
          <b>{report.graph.edges.length}</b>
        </article>
        <article>
          <span>Assurance cases</span>
          <b>{report.assuranceCases.length}</b>
        </article>
      </section>
      <section className="split">
        <AssuranceSummary report={report} />
        <SystemMap report={report} compact />
      </section>
    </>
  );
}

function DecisionExplainer({ report }: { report: AnalysisReport }) {
  const attention = report.controls.filter((item) =>
    ['FAIL', 'PARTIAL', 'UNKNOWN'].includes(item.outcome),
  );
  if (!attention.length) return null;

  return (
    <section className="decision-explainer">
      <div className="section-head">
        <div>
          <p className="eyebrow">WHY THIS DECISION</p>
          <h2>Release decisions remain traceable to controls and evidence.</h2>
          <p>
            Drantis does not collapse uncertainty into a pass. The controls below are the
            highest-value places to inspect before release.
          </p>
        </div>
      </div>
      <div className="decision-list">
        {attention.slice(0, 8).map((item) => {
          const evidence = report.evidence.filter((entry) => item.evidenceIds.includes(entry.id));
          const findings = report.findings.filter((entry) => item.findingIds.includes(entry.id));
          return (
            <article key={item.control.id}>
              <header>
                <code>{item.control.id}</code>
                <span className={`outcome ${item.outcome.toLowerCase()}`}>{item.outcome}</span>
              </header>
              <h3>{item.control.title}</h3>
              <p>{item.rationale}</p>
              <div className="decision-evidence">
                <b>Observed evidence</b>
                <span>
                  {evidence.length
                    ? evidence
                        .slice(0, 3)
                        .map((entry) => entry.title)
                        .join(' · ')
                    : 'No supporting evidence was attached to this control.'}
                </span>
              </div>
              <div className="decision-evidence">
                <b>Findings</b>
                <span>
                  {findings.length
                    ? findings
                        .slice(0, 3)
                        .map((entry) => entry.title)
                        .join(' · ')
                    : 'No normalized finding is attached; uncertainty may still remain.'}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AssuranceSummary({ report }: { report: AnalysisReport }) {
  return (
    <div>
      <p className="eyebrow">ASSURANCE CASES</p>
      <h3>Claims are only as strong as their evidence.</h3>
      {report.assuranceCases.slice(0, 5).map((item) => (
        <article className="case" key={item.id}>
          <div>
            <code>{item.id}</code>
            <span className={`pill ${item.state.toLowerCase()}`}>{item.state}</span>
          </div>
          <h4>{item.claim}</h4>
          <p>{item.rationale[0]}</p>
          <small>
            {item.evidenceIds.length} evidence item(s) · {item.controlIds.join(' + ')}
          </small>
        </article>
      ))}
    </div>
  );
}

function nodePosition(index: number, total: number) {
  const columns = Math.max(3, Math.ceil(Math.sqrt(total)));
  const row = Math.floor(index / columns);
  const col = index % columns;
  return { x: 90 + col * 190 + (row % 2) * 35, y: 80 + row * 120 };
}

function SystemMap({ report, compact = false }: { report: AnalysisReport; compact?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(report.graph.nodes[0]?.id ?? null);
  const selected = report.graph.nodes.find((node) => node.id === selectedId) ?? null;
  const positions = useMemo(
    () =>
      new Map(
        report.graph.nodes.map((node, index) => [
          node.id,
          nodePosition(index, report.graph.nodes.length),
        ]),
      ),
    [report.graph.nodes],
  );
  if (compact)
    return (
      <div>
        <p className="eyebrow">SYSTEM MAP</p>
        <h3>
          {report.graph.nodes.length} components · {report.graph.edges.length} trust relationships
        </h3>
        <div className="map compact">
          {report.graph.nodes.slice(0, 12).map((node, index) => (
            <button className={`node n${index % 6}`} key={node.id}>
              <span>{node.type}</span>
              <b>{node.label}</b>
              <small>{node.evidenceIds.length} evidence</small>
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <section className="system-view">
      <div className="section-head">
        <div>
          <p className="eyebrow">SYSTEM MAP</p>
          <h2>Architecture and trust relationships</h2>
          <p>
            Select a node to trace the evidence and relationships Drantis actually observed.
          </p>
        </div>
        <div className="legend">
          <span>AUTH</span>
          <span>DATA</span>
          <span>TRUST</span>
          <span>EXTERNAL</span>
        </div>
      </div>
      <div className="system-grid">
        <div className="graph-canvas">
          <svg
            viewBox={`0 0 900 ${Math.max(520, Math.ceil(report.graph.nodes.length / 4) * 150)}`}
            role="img"
            aria-label="Drantis application security graph"
          >
            {report.graph.edges.map((edge) => {
              const a = positions.get(edge.from),
                b = positions.get(edge.to);
              if (!a || !b) return null;
              return (
                <g key={edge.id}>
                  <line x1={a.x + 60} y1={a.y + 22} x2={b.x + 60} y2={b.y + 22} />
                  <text x={(a.x + b.x) / 2 + 60} y={(a.y + b.y) / 2 + 14}>
                    {edge.type}
                  </text>
                </g>
              );
            })}
            {report.graph.nodes.map((node) => {
              const pos = positions.get(node.id)!;
              return (
                <g
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  className={selectedId === node.id ? 'graph-selected' : ''}
                  tabIndex={0}
                  role="button"
                >
                  <rect x={pos.x} y={pos.y} width="130" height="52" rx="3" />
                  <text x={pos.x + 10} y={pos.y + 18}>
                    {node.type}
                  </text>
                  <text className="label" x={pos.x + 10} y={pos.y + 36}>
                    {node.label.slice(0, 18)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <NodeInspector node={selected} report={report} />
      </div>
    </section>
  );
}

function NodeInspector({ node, report }: { node: GraphNode | null; report: AnalysisReport }) {
  if (!node)
    return (
      <aside className="inspector">
        <p>Select a graph node.</p>
      </aside>
    );
  const incoming = report.graph.edges.filter((edge) => edge.to === node.id);
  const outgoing = report.graph.edges.filter((edge) => edge.from === node.id);
  const nodeEvidence = report.evidence.filter((item) => node.evidenceIds.includes(item.id));
  return (
    <aside className="inspector">
      <p className="eyebrow">NODE INSPECTOR</p>
      <span className="node-type">{node.type}</span>
      <h3>{node.label}</h3>
      <dl>
        <dt>Evidence</dt>
        <dd>{node.evidenceIds.length}</dd>
        <dt>Incoming</dt>
        <dd>{incoming.length}</dd>
        <dt>Outgoing</dt>
        <dd>{outgoing.length}</dd>
      </dl>
      <h4>Relationships</h4>
      {[...incoming, ...outgoing].slice(0, 10).map((edge) => (
        <div className="relation" key={edge.id}>
          <code>{edge.type}</code>
          <span>{edge.from === node.id ? 'outgoing' : 'incoming'}</span>
        </div>
      ))}
      <h4>Evidence</h4>
      {nodeEvidence.map((item) => (
        <div className="evidence-mini" key={item.id}>
          <b>{item.title}</b>
          <span>
            {item.source?.path ?? 'analysis'}
            {item.source?.line ? `:${item.source.line}` : ''}
          </span>
        </div>
      ))}
    </aside>
  );
}

function normalizeArchitectureLabel(value: string) {
  return value.trim().toLowerCase().replace(/\\s+/g, ' ');
}

function SentenView({ report }: { report: AnalysisReport }) {
  const sentenEvidence = report.evidence.filter(
    (item) =>
      item.analyzer.id.includes('senten') ||
      item.kind.startsWith('senten.') ||
      item.kind === 'platform.senten' ||
      (item.kind.startsWith('imported.') && item.analyzer.id.includes('senten')),
  );
  const sentenNodes = report.graph.nodes.filter(
    (node) =>
      node.metadata.source === 'senten' ||
      node.metadata.importedFrom === 'senten' ||
      node.metadata.intended === true,
  );
  const sentenEdges = report.graph.edges.filter(
    (edge) => edge.metadata?.importedFrom === 'senten' || edge.metadata?.intended === true,
  );
  const intendedNodes = sentenNodes.filter((node) => node.metadata.intended === true);
  const observedNodes = report.graph.nodes.filter(
    (node) => node.metadata.intended !== true && node.metadata.importedFrom !== 'senten',
  );
  const observedLabels = new Set(
    observedNodes.map((node) => normalizeArchitectureLabel(node.label)),
  );
  const intendedLabels = new Set(
    intendedNodes.map((node) => normalizeArchitectureLabel(node.label)),
  );
  const matchedNodes = intendedNodes.filter((node) =>
    observedLabels.has(normalizeArchitectureLabel(node.label)),
  );
  const intendedOnly = intendedNodes.filter(
    (node) => !observedLabels.has(normalizeArchitectureLabel(node.label)),
  );
  const observedOnly = observedNodes.filter(
    (node) => !intendedLabels.has(normalizeArchitectureLabel(node.label)),
  );
  if (!sentenEvidence.length)
    return (
      <section>
        <div className="section-head">
          <div>
            <p className="eyebrow">SENTEN INTEGRATION</p>
            <h2>No Senten artifacts detected</h2>
            <p>
              This snapshot did not declare Senten architecture or a versioned Senten → Drantis
              evidence envelope. Drantis does not invent Senten state.
            </p>
          </div>
        </div>
        <div className="empty-inline">
          Analyze a Senten-enabled repository to visualize intended architecture, invariants and
          imported evidence here.
        </div>
      </section>
    );
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">SENTEN INTEGRATION</p>
          <h2>Intended architecture meets observed assurance</h2>
          <p>
            Senten artifacts are imported as evidence and intended-architecture graph data. They can
            support Drantis reasoning, but cannot independently create a Drantis VERIFIED
            result.
          </p>
        </div>
      </div>
      <div className="metric-row">
        <article>
          <span>Senten evidence</span>
          <b>{sentenEvidence.length}</b>
        </article>
        <article>
          <span>Intended nodes</span>
          <b>{sentenNodes.length}</b>
        </article>
        <article>
          <span>Intended edges</span>
          <b>{sentenEdges.length}</b>
        </article>
        <article>
          <span>Matched architecture</span>
          <b>{matchedNodes.length}</b>
        </article>
      </div>
      <div className="architecture-diff">
        <article>
          <span className="diff-state matched">MATCHED</span>
          <h3>{matchedNodes.length} intended component(s) observed</h3>
          <p>
            {matchedNodes.length
              ? matchedNodes
                  .map((node) => node.label)
                  .slice(0, 8)
                  .join(' · ')
              : 'No intended component label currently correlates with an observed graph node.'}
          </p>
        </article>
        <article>
          <span className="diff-state unobserved">UNOBSERVED</span>
          <h3>{intendedOnly.length} intended component(s) not observed</h3>
          <p>
            {intendedOnly.length
              ? intendedOnly
                  .map((node) => node.label)
                  .slice(0, 8)
                  .join(' · ')
              : 'Every imported intended component has an observed label match.'}
          </p>
        </article>
        <article>
          <span className="diff-state undeclared">UNDECLARED</span>
          <h3>{observedOnly.length} observed component(s) not declared by Senten</h3>
          <p>
            {observedOnly.length
              ? observedOnly
                  .map((node) => node.label)
                  .slice(0, 8)
                  .join(' · ')
              : 'No additional observed components were found.'}
          </p>
        </article>
      </div>
      <p className="correlation-note">
        Architecture correlation is deterministic label matching over normalized graph nodes. A
        match is evidence of correspondence, not proof that an invariant is satisfied. Runtime
        verification remains separate.
      </p>
      <div className="evidence-list">
        {sentenEvidence.map((item) => (
          <article key={item.id}>
            <code className={item.certainty.toLowerCase()}>{item.certainty}</code>
            <div>
              <b>{item.title}</b>
              <span>{item.description}</span>
              <span>{item.source?.path ?? 'analysis'}</span>
            </div>
            <small>
              {item.analyzer.id}@{item.analyzer.version}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

function AssuranceExplorer({ report }: { report: AnalysisReport }) {
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">ASSURANCE CASE EXPLORER</p>
          <h2>Claim → controls → evidence → certainty → result</h2>
        </div>
      </div>
      <div className="assurance-grid">
        {report.assuranceCases.map((item) => (
          <article className="assurance-card" key={item.id}>
            <header>
              <code>{item.id}</code>
              <span className={`pill ${item.state.toLowerCase()}`}>{item.state}</span>
            </header>
            <h3>{item.claim}</h3>
            <div className="claim-flow">
              <span>CLAIM</span>
              <i>→</i>
              <span>{item.controlIds.length} CONTROLS</span>
              <i>→</i>
              <span>{item.evidenceIds.length} EVIDENCE</span>
              <i>→</i>
              <b>{item.state}</b>
            </div>
            {item.rationale.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {item.verificationEvidenceIds?.length ? (
              <small>
                Deterministic verification evidence: {item.verificationEvidenceIds.length}
              </small>
            ) : (
              <small>No deterministic runtime verification evidence attached.</small>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Findings({ report }: { report: AnalysisReport }) {
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">FINDINGS</p>
          <h2>{report.findings.length} normalized finding(s)</h2>
        </div>
      </div>
      {report.findings.length === 0 ? (
        <div className="empty-inline">
          No configured analyzer or scanner produced a finding for this snapshot. This is not proof
          of absence.
        </div>
      ) : (
        <div className="finding-list">
          {report.findings.map((item) => (
            <article key={item.id}>
              <header>
                <span className={`severity ${item.severity}`}>{item.severity}</span>
                <code>{item.ruleId}</code>
                <small>{Math.round(item.confidence * 100)}% confidence</small>
              </header>
              <h3>{item.title}</h3>
              <p>{item.explanation}</p>
              <div>
                <b>Impact</b>
                <span>{item.impact}</span>
              </div>
              <div>
                <b>Remediation</b>
                <span>{item.remediation}</span>
              </div>
              <footer>
                <span>
                  {item.source?.path ?? 'analysis'}
                  {item.source?.line ? `:${item.source.line}` : ''}
                </span>
                <span>{item.evidenceIds.length} evidence link(s)</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EvidenceLedger({ report }: { report: AnalysisReport }) {
  return (
    <section className="evidence">
      <div className="section-head">
        <div>
          <p className="eyebrow">EVIDENCE LEDGER</p>
          <h2>{report.evidence.length} analysis artifacts</h2>
        </div>
        <p>
          AI-generated prose is not deterministic evidence. Each row retains analyzer and snapshot
          provenance.
        </p>
      </div>
      <div className="evidence-list">
        {report.evidence.map((item) => (
          <article key={item.id}>
            <code className={item.certainty.toLowerCase()}>{item.certainty}</code>
            <div>
              <b>{item.title}</b>
              <span>{item.description}</span>
              <span>
                {item.source?.path ?? 'analysis'}
                {item.source?.line ? `:${item.source.line}` : ''}
              </span>
            </div>
            <small>
              {item.analyzer.id}@{item.analyzer.version}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

function Controls({ report }: { report: AnalysisReport }) {
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">LAUNCHPROOF BUILD STANDARD v0.1</p>
          <h2>LP-01 → LP-20</h2>
        </div>
      </div>
      <div className="control-grid">
        {report.controls.map((item) => (
          <article key={item.control.id}>
            <header>
              <code>{item.control.id}</code>
              <span className={`outcome ${item.outcome.toLowerCase()}`}>{item.outcome}</span>
            </header>
            <h3>{item.control.title}</h3>
            <p>{item.rationale}</p>
            <small>
              {item.evidenceIds.length} evidence · {item.findingIds.length} findings · weight{' '}
              {item.control.weight ?? 1}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

function History({ current, history }: { current: AnalysisReport; history: AnalysisReport[] }) {
  const rows = history.length ? history : [current];
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">SESSION ANALYSIS HISTORY</p>
          <h2>Snapshot-specific decisions</h2>
          <p>
            History in Showcase Mode is held only for this browser session. It is not represented as
            persistent audit history.
          </p>
        </div>
      </div>
      <div className="history-list">
        {rows.map((item) => (
          <article key={item.id}>
            <div>
              <code>{item.provenance.commit}</code>
              <span>{item.provenance.repository}</span>
            </div>
            <strong>
              {item.release.score}
              <small>/100</small>
            </strong>
            <span className={`status ${item.release.status.toLowerCase()}`}>
              {item.release.status.replaceAll('_', ' ')}
            </span>
            <time>{new Date(item.provenance.analyzedAt).toLocaleString()}</time>
          </article>
        ))}
      </div>
    </section>
  );
}

function Intelligence({ report }: { report: AnalysisReport }) {
  const aiEvidence = report.evidence.filter(
    (item) => item.kind.startsWith('ai.') || item.kind.includes('ai-provider'),
  );
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">INTELLIGENCE PROVIDERS</p>
          <h2>Optional reasoning above deterministic evidence</h2>
          <p>
            The current Showcase analysis makes no external model call. Provider adapters exist for
            OpenAI, Anthropic, Gemini, Ollama and OpenAI-compatible endpoints, but model output
            cannot establish a passed control or VERIFIED guarantee.
          </p>
        </div>
      </div>
      <div className="policy-grid">
        <article>
          <b>Evidence Only</b>
          <p>Normalized evidence and graph/control context only. Source excerpts are withheld.</p>
        </article>
        <article>
          <b>Relevant Context</b>
          <p>Bounded source excerpts may be supplied only when explicitly authorized.</p>
        </article>
        <article>
          <b>Extended Context</b>
          <p>Broader repository context is allowed only by explicit policy.</p>
        </article>
        <article>
          <b>Local Only</b>
          <p>Repository context cannot leave user-controlled infrastructure.</p>
        </article>
      </div>
      <div className="empty-inline">
        This report contains {aiEvidence.length} AI-related deterministic indicator(s). AI-generated
        prose, if enabled later, remains interpretation—not deterministic evidence.
      </div>
    </section>
  );
}

function Settings({ report }: { report: AnalysisReport }) {
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">ANALYSIS SETTINGS & LIMITATIONS</p>
          <h2>What this result can—and cannot—claim</h2>
          <p>
            These values come from the current analysis report and provenance rather than a
            synthetic settings panel.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <article>
          <span>Repository</span>
          <b>{report.provenance.repository}</b>
        </article>
        <article>
          <span>Commit</span>
          <code>{report.provenance.commit}</code>
        </article>
        <article>
          <span>Policy version</span>
          <b>{report.provenance.policyVersion}</b>
        </article>
        <article>
          <span>Drantis</span>
          <b>{report.provenance.launchProofVersion}</b>
        </article>
        <article>
          <span>Analyzers</span>
          <b>{report.provenance.analyzers?.length ?? 0}</b>
        </article>
        <article>
          <span>Evidence coverage</span>
          <b>{report.release.coverage ?? 0}%</b>
        </article>
      </div>
      <div className="limitations">
        <h3>Known limitations for this snapshot</h3>
        {report.limitations.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
      <p className="certification-note">
        A Drantis report is evidence about one analyzed snapshot. It is not permanent security
        certification.
      </p>
    </section>
  );
}
