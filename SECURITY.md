# Security Policy

Drantis analyzes hostile input. Please report suspected vulnerabilities privately to the maintainers rather than opening a public exploit issue. Do not include live credentials or third-party source code in reports.

## Security invariants

- Static analysis does not execute repository code.
- `VERIFIED` is reserved for deterministic verification capable of testing the stated guarantee.
- Invalid policy fails closed rather than silently falling back.
- Showcase Mode analyzes only explicit allowlisted fixtures.
- Secret evidence is redacted; matched credential values are not stored in reports.
- AI providers cannot independently pass controls or release gates.

Dynamic verification is opt-in and runs only through the constrained isolated-runner boundary. Static analysis never executes target repository code. See `docs/threat-model.md`, `docs/sandboxing.md`, and `docs/limitations.md`.
