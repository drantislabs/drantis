# Roadmap

## Drantis 1.0

Drantis is now being hardened toward the first public stable release rather than publishing the earlier v0.2 implementation candidate. The v0.2 work established the architecture; the 1.0 program turns that architecture into a dependable product and distribution.

### 1. Core correctness and verification

- Node.js 24 LTS baseline and Node.js 26 forward-compatibility lane.
- clean install, formatting, lint, TypeScript, unit/integration/security tests;
- production Next.js build and compiled CLI package;
- controlled production-reference and missing-authorization regressions;
- Drantis self-analysis;
- Playwright browser validation;
- Docker build/Compose validation;
- scanner-ingestion and isolated-runner checkpoints.

### 2. Product UI

The web UI is a real Drantis client over the same normalized report model used by the CLI. The 1.0 interface includes:

- release decision and domain scoring;
- explicit blockers and release conditions;
- a “Why this decision” evidence/control view;
- Assurance Case explorer;
- findings and evidence ledger;
- interactive Application Security Graph;
- Senten intended-vs-observed architecture view;
- comparison/regression workflow;
- session history;
- governed AI/data-policy explanation;
- provenance and limitations.

Hosted Showcase Mode remains restricted to server-authorized fixtures. Arbitrary local repository access belongs to the CLI/Desktop boundary.

### 3. Desktop

Tauri remains the local developer shell. It validates repository paths and exposes a narrow allowlisted native-operation bridge rather than arbitrary shell execution. The 1.0 desktop checkpoint covers Windows packaging and real-machine behavior.

### 4. Senten

Senten remains independently useful. Drantis detects structured Senten declarations, imports commit-bound evidence, maps intended architecture/invariants into the graph, and correlates intended architecture with observed Drantis graph data. Imported Senten VERIFIED claims are never promoted directly to Drantis VERIFIED.

### 5. Distribution

The 1.0 release target includes:

- GitHub Release for `v1.0.0`;
- compiled CLI artifact;
- GHCR Docker image;
- Windows Tauri bundle after machine verification;
- checksums and release notes;
- npm publication only after package-namespace ownership and registry credentials are explicitly configured.

### 6. Public OSS/security hardening

- Apache-2.0 licensing;
- SECURITY and responsible-disclosure guidance;
- threat model and limitations;
- safe hostile-repository analysis defaults;
- fail-closed execution and external evidence boundaries;
- release CI and provenance;
- dependency/scanner review;
- no silent source transmission to model providers.

### 7. v1 release gate

No `v1.0.0` tag is created until the release-candidate matrix passes and the human release gate approves the evidence. Implementation is not treated as verification.

See [v1-release-plan.md](v1-release-plan.md) and [release-verification.md](release-verification.md).

## Post-1.0 depth work

1. deeper interprocedural TypeScript dataflow and call resolution;
2. additional framework adapters: Django, FastAPI, Laravel, Firebase and AWS;
3. persistent multi-user history for team deployments;
4. richer signed attestations/SBOM correlation;
5. broader desktop packaging after platform-specific verification;
6. extension SDK/community ecosystem stabilization;
7. additional authorized Drantis Labs scenarios.
