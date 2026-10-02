# Architecture

Drantis is a modular monorepo. `@launchproof/core` owns normalized contracts, orchestration, report comparison and verification coordination. Static analyzers, scanner adapters and evidence producers emit normalized artifacts. The graph, control engine, Assurance Cases and scoring layer consume those artifacts. Clients are replaceable and never define security conclusions.

## Trust boundaries

1. **Repository snapshot boundary:** hostile files enter a bounded reader. Symlinks, traversal escape, excessive depth, oversized files, excessive aggregate text, common vendor/build directories and binary-looking content are excluded.
2. **Analyzer boundary:** static analyzers may read snapshot content but receive no shell/process capability.
3. **Scanner boundary:** scanner outputs are normalized as attributed evidence; scanner commands are not executed by adapters.
4. **Execution boundary:** dynamic verification is represented by `IsolatedRunner`; execution requires policy opt-in plus explicit invocation authorization.
5. **Intelligence boundary:** model providers receive only data permitted by AI policy; their output cannot mutate controls/cases/release decisions.
6. **Showcase boundary:** hosted analysis accepts only hard-allowlisted server targets and controlled scenarios.
7. **Desktop boundary:** the Tauri webview has minimal capabilities and narrow native commands rather than ambient filesystem/process authority.

## Dependency direction

```text
Web / Desktop / CLI / CI
          ↓
      Core contracts
          ↓
Analyzers / Scanner adapters / Evidence producers
          ↓
Application Security Graph
          ↓
Build Standard controls
          ↓
Assurance Cases
          ↓
Deterministic scoring + hard gates
          ↓
Optional Intelligence
```

The GUI and CLI consume the same report model. Dynamic runners and model providers are adapters rather than dependencies of deterministic evaluation.

## Extension boundary

Drantis Core is platform-agnostic. Ecosystem knowledge enters through language/framework/platform adapters and evidence importers. The core owns normalized evidence, graph, controls, Assurance Cases, policy and release decisions; adapters own ecosystem detection and interpretation. Senten is the first official platform adapter and is intentionally not a Core dependency.
