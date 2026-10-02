# Senten integration

Status: **Native Senten 1.0.3 interoperability is implemented at the Drantis contract/CLI layer. Desktop execution remains a real-machine release checkpoint.**

Drantis and Senten remain independently useful products. Drantis does not require Senten, and Senten does not require Drantis.

## Stable product boundary

Senten 1.0.3 describes application intent, StateTruss semantics, policies, invariants, runtime observations, journeys and accumulated evidence.

Drantis independently asks whether the available evidence is strong enough to support a release claim.

The native exchange is deliberately asymmetric:

```text
Senten
  senten launchproof export
          ↓
senten-assurance-exchange / schema 0.1
          ↓
Drantis
  independent repository analysis
  controls + Assurance Cases
  optional isolated verification
          ↓
launchproof-verification-result / schema 0.1
          ↓
Senten
  senten launchproof import
```

Senten evidence never directly creates Drantis `VERIFIED`. Drantis only returns a `verified` claim result when the corresponding Drantis Assurance Case independently reaches `VERIFIED`.

## Native Senten 1.0.3 workflow

Export from the target project:

```bash
senten launchproof export
```

Senten writes a digest-bound artifact under `.senten/artifacts/assurance/` by default.

Inspect it without executing repository code:

```bash
drantis senten inspect .senten/artifacts/assurance/<bundle>.senten-assurance.json
```

Run independent Drantis analysis and create a result Senten can import:

```bash
drantis senten verify .senten/artifacts/assurance/<bundle>.senten-assurance.json \
  --repo . \
  --output .drantis/drantis-result.json
```

Import the result:

```bash
senten launchproof import .drantis/drantis-result.json \
  --source .senten/artifacts/assurance/<bundle>.senten-assurance.json
```

Unsigned Drantis results are intentionally accepted by Senten only as tested evidence.

## Trusted independent verification

Drantis can generate an Ed25519 keypair using the same key-id convention Senten 1.0.3 expects:

```bash
drantis senten keygen .drantis/keys
senten trust add .drantis/keys/<launchproof-public-key>.public.pem --publisher launchproof
```

Then sign the verification result:

```bash
drantis senten verify <bundle>.senten-assurance.json \
  --repo . \
  --output .drantis/drantis-result.json \
  --sign-key .drantis/keys/<launchproof-private-key>.private.pem
```

Senten validates the source bundle id and digest, claim subjects, Ed25519 signature and local publisher trust before it can import a Drantis `verified` result as strength-4 independent evidence.

## Conservative mapping

Drantis maps a Senten claim to a Drantis Assurance Case only through:

1. explicit claim metadata `launchproofAssuranceCaseId`; or
2. deterministic subject/statement hints for Drantis's standard Assurance Cases.

A mapped case produces:

- `verified` only when the Drantis Assurance Case is `VERIFIED`;
- `failed` when the independent Drantis case is `FAILED`;
- `inconclusive` for `SUPPORTED` or `PARTIAL`;
- `unknown` for missing/unsupported evidence.

Observed graph correspondence alone is `inconclusive`, never verified.

## Legacy generic evidence interchange

Drantis uses `drantis-evidence/v1` as its canonical generic EvidenceImporter ABI and still accepts legacy `launchproof-evidence/v1` documents. This remains useful for extensions and tools other than Senten.

Senten 1.0.3 should preferentially use its native `senten-assurance-exchange` / `launchproof-verification-result` protocol because it provides digest binding, stable claim IDs and a local trust path.

## UI and architecture correspondence

The web UI continues to show Senten intended architecture alongside Drantis-observed architecture using MATCHED, UNOBSERVED and UNDECLARED correspondence signals.

The native assurance exchange analyzer also adds Senten claims to the normalized graph as intended nodes. Those nodes improve explanation and correlation but do not create a pass by themselves.

## Desktop bridge

Drantis Desktop now targets the actual stable Senten 1.0.3 CLI surface with fixed operations:

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

Drantis now exposes:

```bash
drantis capabilities
```

The machine-readable `drantis-capabilities/v1` document advertises supported surfaces, the `drantis-evidence/v1` interchange contract, and assurance protocol versions. This gives LobeWork a future discovery boundary without coupling LobeWork to Drantis's internal package graph or Tauri implementation.

A future LobeWork integration should consume Drantis through versioned capability/report/assurance contracts, not by importing Drantis internals.

## Release checkpoint

Before Drantis 1.0 is tagged, the following still require real-machine evidence:

- Senten 1.0.3 npm installation on Windows;
- Drantis Desktop invoking the fixed Senten operations;
- a real `senten launchproof export → drantis senten verify → senten launchproof import` round trip;
- trusted-key import producing Senten strength-4 evidence only when Drantis actually returned a verified claim;
- desktop packaging and icon completion.


## Legacy Senten protocol identifiers

Senten 1.0.3 shipped its native bridge before the Drantis rename. Commands such as `senten launchproof export`, the `launchproof-verification-result` schema, and the `launchproof` trusted-publisher convention remain supported compatibility identifiers. Drantis treats these as protocol names, not product branding, until a coordinated Senten protocol revision is released.
