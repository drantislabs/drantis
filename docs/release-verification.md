# Release verification

Drantis does not treat implementation as release verification. A 1.0 release candidate must be exercised from a clean, networked machine with the supported toolchain.

## Runtime lanes

Drantis 1.0 uses Node.js 24.x LTS as the release-verification baseline and Node.js 26.x as the required forward-compatibility lane. Public CI must pass both.

From a clean checkout with the committed lockfile:

```bat
node scripts\verify-release.mjs
```

Browser and Docker gates can be enabled explicitly:

```bat
node scripts\verify-release.mjs --e2e --docker
```

The canonical Node harness runs from Command Prompt, PowerShell, bash or CI and stops on the first failed gate. A failed checkpoint is evidence to diagnose and repair; it must not be converted into a pass.

## Baseline evidence

The baseline runs:

- Git/worktree provenance when available;
- reproducible `npm ci --ignore-scripts`;
- formatting and lint;
- TypeScript project checking;
- Vitest;
- production web build;
- compiled CLI build and package dry-run;
- production-reference and broken-tenant-authorization regression scenarios;
- the Senten structured architecture/evidence scenario;
- Semgrep, Gitleaks, OSV and Trivy normalization fixtures;
- Drantis self-analysis.

With `--e2e --docker`, the harness additionally runs Playwright, Docker build/Compose validation and a real explicitly authorized Docker-isolated verification using an immutable image ID and network disabled.

## What still requires a real-machine checkpoint

CI can prove buildability and deterministic automated behavior, but the stable tag also requires:

- fresh-clone installation outside the development workspace;
- Windows desktop launch and repository selection;
- Git and Docker native bridge operations;
- Senten native bridge operations against the actual supported Senten executable;
- inspection of generated desktop bundles, CLI package, SBOM, self-analysis and checksums.

## Dependency and execution policy

Dependency installation uses `--ignore-scripts` so dependency lifecycle scripts do not execute during release verification. If a dependency later requires an installation script, that must be reviewed explicitly rather than silently weakening the gate.

Static repository inspection remains non-executing. Dynamic verification remains an explicit, isolated and separately authorized operation.
