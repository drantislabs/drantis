# Drantis 1.0 release notes

Status: **release candidate — do not publish as stable until every mandatory gate is evidenced.**

## What 1.0 delivers

Drantis 1.0 turns repository inspection into an evidence-backed release decision. The stable release is intended to include:

- deterministic TypeScript/JavaScript, Node.js, React, Next.js and Supabase-aware analysis;
- a typed Application Security Graph;
- LP-01 through LP-20 controls and Assurance Cases;
- deterministic Release Confidence with hard gates;
- normalized Semgrep, Gitleaks, OSV and Trivy evidence;
- JSON and SARIF reporting through the compiled CLI;
- opt-in isolated Docker verification with explicit authorization;
- a self-hosted Next.js visual experience;
- a Windows Tauri desktop client;
- first-class Senten structured architecture/evidence interoperability;
- optional governed AI explanation that cannot mint evidence or change release gates.

## Distribution target

The stable GitHub release is expected to contain the CLI package, CycloneDX SBOM, checksums, commit-bound self-analysis evidence, and verified Windows desktop bundles. The release workflow also publishes the canonical container image to GHCR.

npm publication remains a separate explicit decision. The monorepo's internal packages are not public API commitments in 1.0.

## Known boundaries

Drantis is not a permanent security certification. A result applies to the analyzed snapshot, policy, evidence and toolchain.

Deep deterministic framework support in 1.0 is intentionally concentrated on the TypeScript/JavaScript and Next.js/Supabase ecosystem. Other ecosystems use the versioned extension contracts and must not be represented as deeply supported until adapters are implemented and verified.

Static analysis does not prove runtime behavior. `VERIFIED` certainty requires explicitly authorized deterministic verification capable of exercising the relevant guarantee.

Scanner adapters normalize supplied scanner results. Drantis does not silently execute third-party scanners during ordinary static analysis.

AI is optional. External providers receive repository material only under the selected data-governance policy, and model output cannot change controls, Assurance Cases or release decisions.

## Stable-release gate

The `v1.0.0` tag is a human release gate. Before it is created, the acceptance matrix in `docs/v1-release-plan.md` must have evidence for every mandatory item and the release artifacts/checksums must be inspected.
