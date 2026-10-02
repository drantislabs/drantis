# Extensions

Drantis Core consumes normalized assurance concepts. Language, framework, platform and external-tool knowledge belongs behind extension contracts.

## v1 contracts

Public contracts include `Analyzer`, `LanguageAdapter`, `FrameworkAdapter`, `PlatformAdapter`, `ScannerAdapter`, `EvidenceImporter`, `EvidenceProducer`, `IntelligenceProvider`, `Reporter` and `IsolatedRunner`.

Every formal extension declares an `ExtensionManifest` using `apiVersion: launchproof.dev/v1`, a stable ID/version, capabilities and a Drantis Core compatibility range. Unknown capabilities and duplicate registered IDs fail closed.

Current capabilities cover language/framework/platform detection, architecture, policy, invariants, evidence, graph contribution, controls, runtime verification, scanner import and reporting.

Extensions emit normalized evidence/findings/graph artifacts; they do not mutate Release Decisions directly. Stable IDs and version strings are required for provenance. Imported external evidence cannot independently mint Drantis `VERIFIED` certainty.

## Evidence interchange

`launchproof-evidence/v1` is the vendor-neutral evidence envelope for external producers. It binds producer identity and version to a repository commit and may contain evidence, assurance claims and normalized graph fragments. Commit mismatch fails closed.

## First official platform adapter

Senten is the first adapter proving the contract. See [Senten integration](./senten-integration.md).

Examples also live under:

- `packages/integrations/examples/custom-analyzer.ts`
- `packages/intelligence/examples/provider.ts`

A marketplace, remote extension downloading and arbitrary runtime plugin loading are intentionally out of scope for v0.2.
