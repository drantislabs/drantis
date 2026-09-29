# Senten integration

Status: **Native Senten 1.0.3 interoperability is implemented at the LaunchProof contract/CLI layer. Desktop execution remains a real-machine release checkpoint.**

LaunchProof and Senten remain independently useful products. LaunchProof does not require Senten, and Senten does not require LaunchProof.

## Stable product boundary

Senten 1.0.3 describes application intent, StateTruss semantics, policies, invariants, runtime observations, journeys and accumulated evidence.

LaunchProof independently asks whether the available evidence is strong enough to support a release claim.

The native exchange is deliberately asymmetric:

```text
Senten
  senten launchproof export
          ↓
senten-assurance-exchange / schema 0.1
          ↓
LaunchProof
  independent repository analysis
  controls + Assurance Cases
  optional isolated verification
          ↓
launchproof-verification-result / schema 0.1
          ↓
Senten
  senten launchproof import
```

Senten evidence never directly creates LaunchProof `VERIFIED`. LaunchProof only returns a `verified` claim result when the corresponding LaunchProof Assurance Case independently reaches `VERIFIED`.

## Native Senten 1.0.3 workflow

Export from the target project:

```bash
senten launchproof export
```

Senten writes a digest-bound artifact under `.senten/artifacts/assurance/` by default.

Inspect it without executing repository code:

```bash
launchproof senten inspect .senten/artifacts/assurance/<bundle>.senten-assurance.json
```

Run independent LaunchProof analysis and create a result Senten can import:

```bash
launchproof senten verify .senten/artifacts/assurance/<bundle>.senten-assurance.json \
  --repo . \
  --output .launchproof/launchproof-result.json
```

Import the result:

```bash
senten launchproof import .launchproof/launchproof-result.json \
  --source .senten/artifacts/assurance/<bundle>.senten-assurance.json
```

Unsigned LaunchProof results are intentionally accepted by Senten only as tested evidence.

## Trusted independent verification

LaunchProof can generate an Ed25519 keypair using the same key-id convention Senten 1.0.3 expects:

```bash
launchproof senten keygen .launchproof/keys
senten trust add .launchproof/keys/<launchproof-public-key>.public.pem --publisher launchproof
```

Then sign the verification result:

```bash
launchproof senten verify <bundle>.senten-assurance.json \
  --repo . \
  --output .launchproof/launchproof-result.json \
  --sign-key .launchproof/keys/<launchproof-private-key>.private.pem
```

Senten validates the source bundle id and digest, claim subjects, Ed25519 signature and local publisher trust before it can import a LaunchProof `verified` result as strength-4 independent evidence.

## Conservative mapping

LaunchProof maps a Senten claim to a LaunchProof Assurance Case only through:

1. explicit claim metadata `launchproofAssuranceCaseId`; or
2. deterministic subject/statement hints for LaunchProof's standard Assurance Cases.

A mapped case produces:

- `verified` only when the LaunchProof Assurance Case is `VERIFIED`;
- `failed` when the independent LaunchProof case is `FAILED`;
- `inconclusive` for `SUPPORTED` or `PARTIAL`;
- `unknown` for missing/unsupported evidence.

Observed graph correspondence alone is `inconclusive`, never verified.

## Legacy generic evidence interchange

LaunchProof still supports `launchproof-evidence/v1` through the generic EvidenceImporter ABI. This remains useful for extensions and tools other than Senten.

Senten 1.0.3 should preferentially use its native `senten-assurance-exchange` / `launchproof-verification-result` protocol because it provides digest binding, stable claim IDs and a local trust path.

## UI and architecture correspondence

The web UI continues to show Senten intended architecture alongside LaunchProof-observed architecture using MATCHED, UNOBSERVED and UNDECLARED correspondence signals.

The native assurance exchange analyzer also adds Senten claims to the normalized graph as intended nodes. Those nodes improve explanation and correlation but do not create a pass by themselves.

## Desktop bridge

LaunchProof Desktop now targets the actual stable Senten 1.0.3 CLI surface with fixed operations:

- `senten --version`
- `senten doctor`
- `senten ask project --format json`
- `senten ask architecture --format json`
- `senten security status`
- `senten evidence summary`
- `senten proof`
- `senten runtime alignment`
- `senten assurance claims`
- `senten launchproof status`
- `senten launchproof export`

The webview cannot choose an executable or supply arbitrary arguments.

On Windows, npm installs Senten as `senten.cmd`. The native Tauri layer uses a fixed `cmd.exe /d /s /c senten.cmd <allowlisted args>` launcher only for Senten. The command and every argument are host-owned constants; repository paths are supplied only as the process working directory. This is not a general shell surface.

## LobeWork boundary

LaunchProof now exposes:

```bash
launchproof capabilities
```

The machine-readable `launchproof-capabilities/v1` document advertises supported surfaces and assurance protocol versions. This gives LobeWork a future discovery boundary without coupling LobeWork to LaunchProof's internal package graph or Tauri implementation.

A future LobeWork integration should consume LaunchProof through versioned capability/report/assurance contracts, not by importing LaunchProof internals.

## Release checkpoint

Before LaunchProof 1.0 is tagged, the following still require real-machine evidence:

- Senten 1.0.3 npm installation on Windows;
- LaunchProof Desktop invoking the fixed Senten operations;
- a real `senten launchproof export → launchproof senten verify → senten launchproof import` round trip;
- trusted-key import producing Senten strength-4 evidence only when LaunchProof actually returned a verified claim;
- desktop packaging and icon completion.
