# Drantis 1.0 Release Plan

Drantis 1.0 is the first stable public release target. The release philosophy is the product philosophy: **evidence before claims**.

## User promise

A user must be able to install Drantis, analyze an authorized repository, understand why a release decision was produced, inspect the evidence and provenance behind it, and export or integrate that result without trusting an opaque model judgment.

## Supported product surfaces

### CLI

The CLI is the canonical automation/CI interface. It supports deterministic analysis, JSON/SARIF output, report rendering and explicitly authorized isolated verification.

### Web

The Next.js interface is the primary visual report experience. Hosted Showcase Mode analyzes only server-authorized fixtures; it does not accept arbitrary filesystem paths or remote repositories from untrusted users.

### Desktop

The Tauri client is the local repository experience. Native powers stay behind a narrow Rust command boundary. The webview does not receive a free-form shell.

### Docker

The container image is the canonical self-hosted web distribution.

## 1.0 acceptance gates

A stable tag requires all of the following evidence:

1. Node 24 and Node 26 CI are green.
2. formatting, lint, TypeScript and Vitest are green.
3. production web and compiled CLI builds are green.
4. CLI package dry-run is green.
5. production-reference scenario analyzes successfully.
6. missing-tenant-authorization scenario produces the expected degraded/blocking result.
7. Drantis self-analysis completes and its limitations are retained.
8. Playwright UI checkpoint passes.
9. Docker image builds and Compose configuration validates.
10. Semgrep, Gitleaks, OSV and Trivy import fixtures normalize correctly.
11. explicitly authorized isolated verification is exercised with a pinned allowlisted runner image.
12. Windows desktop builds and the allowlisted Git/Docker/Senten bridge is tested on a real machine.
13. Senten 1.0.3 structured detection, intended-vs-observed visualization, native assurance export/result interchange, and a real export → verify → import round trip are validated.
14. a fresh clone/install is tested outside the development workspace.
15. LobeWork-facing `drantis-capabilities/v1` discovery remains stable and contains no internal implementation coupling.
16. release artifacts and checksums are inspected before publication.

## Release artifacts

For `v1.0.0`:

- GitHub source archive;
- compiled CLI package artifact;
- GHCR image `ghcr.io/drantislabs/drantis:1.0.0`;
- Windows desktop bundle after successful Windows verification;
- checksums;
- release notes with known limitations and verification scope.

npm publication is intentionally separate from the GitHub/GHCR release until the package namespace and registry credentials are explicitly owned/configured.

## Human release gate

The tag and public GitHub Release are a HUMAN_GATE. CI may build candidate artifacts, but the stable release must not be published if any mandatory gate is unknown, skipped or failed.

A Drantis result is evidence about a specific snapshot and toolchain. It is not permanent security certification.
