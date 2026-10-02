# Drantis

**Build → Inspect → Prove → Ship.**

Drantis is an Apache-2.0 software-assurance platform that asks one question:

> **What evidence do we actually have that this software is ready to release?**

Drantis combines deterministic repository inspection, application-security analysis, architecture intelligence, normalized scanner evidence, a typed Application Security Graph, versioned controls, Assurance Cases, policy evaluation, deterministic Release Confidence, optional isolated verification, and optional evidence-grounded AI reasoning.

The product is built around three rules:

- **Evidence before AI.**
- **Unknown ≠ Passed.**
- **Never claim verification without evidence.**

## Status

**Drantis 1.0 release candidate.** The v0.2 architecture has been promoted into the first stable-release program: product UI, Senten interoperability, release automation, distribution and verification gates are being hardened before the `v1.0.0` tag.

| Capability                                                             | Status                              |
| ---------------------------------------------------------------------- | ----------------------------------- |
| Bounded hostile-repository snapshots                                   | Implemented                         |
| TypeScript AST-aware inspection                                        | Implemented                         |
| Next.js routes/middleware/server actions                               | Implemented                         |
| Supabase/table/RLS discovery                                           | Implemented                         |
| Typed Application Security Graph                                       | Implemented                         |
| LP-01 through LP-20 evaluators                                         | Implemented                         |
| Assurance Cases                                                        | Implemented                         |
| Deterministic Release Confidence + hard gates                          | Implemented                         |
| `.drantis.yml` fail-closed policy                                  | Implemented                         |
| Semgrep/Gitleaks/OSV/Trivy result adapters                             | Implemented                         |
| Isolated Docker verification runner                                    | Implemented, opt-in                 |
| Before/after regression comparison                                     | Implemented                         |
| CLI JSON/SARIF/report output                                           | Implemented                         |
| OpenAI/Anthropic/Gemini/Ollama/OpenAI-compatible intelligence adapters | Implemented, optional               |
| AI data-governance enforcement                                         | Implemented                         |
| Docker self-hosted web experience                                      | Implemented                         |
| Tauri desktop shell                                                    | Experimental                        |
| Broad language ecosystems                                              | Planned through extension contracts |
| Drantis cloud requirement                                          | None                                |

A capability being implemented does **not** mean Drantis proves an application secure. See [`docs/limitations.md`](docs/limitations.md).

## Architecture

```text
Web / Desktop / CLI / CI / API
               │
               ▼
        Drantis Core
               │
   ┌───────────┼────────────┐
   ▼           ▼            ▼
Analyzers   Scanner      Evidence
            Adapters     Producers
   │           │            │
   └───────────┴─────► Application Security Graph
                           │
                      LP-01..LP-20
                           │
                     Assurance Cases
                           │
                  Deterministic Scoring
                           │
                    Release Decision
                           │
               Optional Intelligence

Authorized dynamic verification
               │
               ▼
      IsolatedRunner interface
               │
               ▼
  constrained ephemeral Docker
```

Drantis Core does not depend on the web UI. The web interface, CLI and future clients consume the same normalized report model.

## Safe analysis

Repositories are hostile input. Static analysis:

- does not execute package lifecycle scripts;
- does not install target dependencies;
- does not run tests or builds;
- does not execute repository binaries;
- does not build target Dockerfiles;
- skips symlinks;
- constrains file count, file size, total text size and traversal depth;
- redacts detected secret values from normalized evidence.

Dynamic verification is separate and requires both policy configuration and explicit invocation authorization. The Docker runner uses a read-only source mount, dropped capabilities, `no-new-privileges`, resource limits, timeout, bounded output, temporary filesystems and network-off by default.

## Certainty

- `DETECTED`: Drantis directly observed a structural fact or scanner result.
- `INFERRED`: Drantis deterministically correlated evidence into a supported conclusion.
- `VERIFIED`: an explicitly authorized deterministic verification capable of exercising the guarantee completed in an isolated runner.

Static source indicators never become `VERIFIED` merely because they look convincing.

## Quick start

Node.js 24 LTS is the release baseline. Node.js 26 is also supported and is exercised as the forward-compatibility CI lane.
For release-candidate verification from Windows Command Prompt, run `node scripts\verify-release.mjs --bootstrap` on the first clean checkout.

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm run cli -- analyze scenarios/production-reference
npm run dev -w @launchproof/web
```

Analyzing a repository never installs that repository's dependencies.

### CLI

```bash
drantis analyze .
drantis analyze . --json .drantis/report.json
drantis analyze . --sarif .drantis/report.sarif
drantis analyze . --scanner semgrep-json:semgrep.json
drantis verify .
drantis verify . --allow-execution
drantis report .drantis/report.json
drantis report .drantis/report.json --format sarif
```

`verify --allow-execution` is required before policy-configured dynamic commands may run. A configured allowlisted container image is also required.

Exit codes for `verify`:

- `0`: READY
- `1`: READY_WITH_CONDITIONS or REVIEW_REQUIRED
- `2`: BLOCKED or INCOMPLETE
- `3`: invocation/configuration/analysis error

### Senten 1.0.3 native assurance

Drantis speaks Senten's stable assurance exchange directly. Senten 1.0.3 retains the historical `launchproof` command/protocol identifiers for compatibility:

```bash
senten launchproof export
drantis senten inspect .senten/artifacts/assurance/<bundle>.senten-assurance.json
drantis senten verify .senten/artifacts/assurance/<bundle>.senten-assurance.json \
  --repo . \
  --output .drantis/drantis-result.json
senten launchproof import .drantis/drantis-result.json \
  --source .senten/artifacts/assurance/<bundle>.senten-assurance.json
```

For trusted independent verification, generate a Drantis Ed25519 key with
`drantis senten keygen .drantis/keys`, trust the public key in Senten, and pass the
private key to `drantis senten verify --sign-key ...`.

Drantis never upgrades Senten's own `declared`, `observed`, `tested`, or `verified`
records directly into Drantis `VERIFIED`. A Senten claim is returned as `verified` only
when the mapped Drantis Assurance Case independently reaches `VERIFIED`.

### Machine capability discovery

```bash
drantis capabilities
```

The `drantis-capabilities/v1` document exposes supported surfaces and protocol versions for
future clients such as LobeWork without requiring them to import Drantis internals.

## Scanner adapters

Drantis normalizes outputs from mature tools instead of pretending to replace them:

- Semgrep → code/security findings;
- Gitleaks → redacted secret findings;
- OSV → dependency advisories;
- Trivy → dependency/container/secret findings.

The adapters ingest scanner outputs. Scanner execution itself belongs in CI or the explicit isolated-runner boundary.

## Assurance Cases

Initial first-class cases include authentication/authorization, tenant isolation, secrets, dependency integrity, testable guarantees, production readiness, AI governance and release provenance.

Example:

```text
Users cannot cross tenant boundaries
      ↓
LP-03 Authorization + LP-04 Tenant Isolation + LP-12 Tests
      ↓
route authorization + tenant scope + RLS + security-test evidence
      ↓
SUPPORTED
      ↓
VERIFIED only after deterministic isolated cross-tenant verification
```

## Showcase Mode

The hosted-compatible Showcase UI currently exposes only server-authorized targets:

- Pipeline — Production Reference
- Pipeline — Missing Tenant Authorization
- Drantis — Self Analysis

The controlled regression removes real authorization source from the fixture. The before/after view compares changed controls, Assurance Cases, findings and evidence rather than animating a fabricated score.

## AI / BYOM

Drantis works without AI. Provider adapters exist for OpenAI, Anthropic, Gemini, Ollama and OpenAI-compatible endpoints. Repository context transmission is governed by:

- `evidence-only`;
- `relevant-context`;
- `extended-context`;
- `local-only`.

Repository text is treated as untrusted prompt data. AI output cannot alter controls, Assurance Case states or release gates.

## Docker

Docker is the canonical self-hosted web distribution:

```bash
docker compose up --build
```

The web container is read-only, drops Linux capabilities and uses `no-new-privileges`. Dynamic target execution is not performed inside the web container.

## Desktop

`apps/desktop` contains the Tauri 2 shell. The webview receives only minimal core permissions and narrow native commands. Raw process/filesystem/credential powers are not granted to the webview. Desktop analysis remains architecturally delegated to Drantis Core rather than reimplemented in Rust.

## Repository layout

```text
apps/
  web/             hosted/self-hosted evidence UI
  desktop/         experimental Tauri client shell
packages/
  core/            contracts + orchestration + report comparison
  analyzers/       deterministic TS/JS/Next/Supabase inspection
  evidence/        evidence creation + stable IDs
  graph/           typed Application Security Graph
  standards/       Drantis Build Standard v0.1
  assurance/       controls + Assurance Cases
  policies/        strict .drantis.yml parser + legacy fallback
  scoring/         deterministic weighted Release Confidence
  integrations/    scanner adapters + isolated Docker runner
  intelligence/    optional governed model providers
  cli/             analyze / verify / report / SARIF
  ui/              shared UI package boundary
scenarios/          controlled source fixtures
 tests/             unit/integration/security/E2E tests
 docs/              architecture/security/product documentation
```

## Verification

Drantis does not treat implementation as release verification. The `v1.0.0` tag remains gated by the acceptance matrix in [`docs/v1-release-plan.md`](docs/v1-release-plan.md).

Before a release claim, run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build -w @launchproof/web
docker build .
npm run cli -- analyze . --json .drantis/self-report.json
```

If any command cannot run, that limitation must be reported rather than converted into a pass.

## Open source

License: Apache-2.0. Drantis Core does not require a Drantis account, Drantis cloud, a commercial model API, or external source-code transmission.

## Compatibility during the rename

Drantis is the successor brand to LaunchProof. The `drantis` CLI is primary. The legacy `launchproof` CLI alias and Senten 1.0.3 `launchproof` protocol identifiers remain temporarily supported so existing assurance exchanges and trust workflows do not break during the transition.

## Drantis Labs

Drantis is developed by **Drantis Labs, a Rubbl Media Group company**. ThomasDSCX remains part of the project's creator/contributor lineage. Any public badge or report must reference a specific commit or controlled snapshot, analysis version and date. It is release evidence, **not permanent security certification**.

## Extensibility and Senten

Drantis Core is platform-agnostic. Drantis 1.0 defines versioned language/framework/platform/evidence-importer contracts rather than teaching Core about every ecosystem. Senten is the first official platform adapter: Drantis can detect Senten structure, render intended architecture/invariants, support the canonical `drantis-evidence/v1` importer plus the legacy `launchproof-evidence/v1` compatibility schema for extensions, and natively exchange Senten 1.0.3 `senten-assurance-exchange` / `launchproof-verification-result` artifacts without trusting Senten to mark Drantis controls as passed. See [`docs/senten-integration.md`](docs/senten-integration.md).

Drantis Desktop also exposes a narrow allowlisted native-operation bridge for Senten/Git/Docker diagnostics. It deliberately does **not** expose a free-form terminal or arbitrary shell execution to the webview.
