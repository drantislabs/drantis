# Threat Model

## Protected assets

- repository source and metadata;
- provider/scanner credentials;
- assurance-report integrity;
- policy and release-gate integrity;
- host filesystem/process boundary;
- tenant/workspace separation in future multi-user deployments;
- public Showcase availability.

## Adversaries

- malicious repository author;
- unauthenticated public Showcase visitor;
- compromised scanner output or dependency;
- malicious containerized target code;
- prompt-injected repository text;
- user accidentally authorizing excessive source transmission;
- attacker attempting resource exhaustion or path escape.

## Threats and mitigations

### Repository execution / command injection

Static analyzers do not execute target code. Dynamic commands use `spawn(..., {shell:false})`, explicit policy, invocation authorization and an isolated runner.

### Path traversal / symlink attacks

Snapshots resolve beneath an authorized root, reject traversal escape, skip symbolic links, bound directory depth and do not expand archives.

### Archive bombs / resource exhaustion

Archives are not unpacked. File count, individual file size, aggregate text size, runner CPU/memory/PID/time and process output are bounded.

### Secret leakage

Built-in and scanner secret evidence retains type/location/fingerprint metadata but not matched secret values. Public reports do not contain source excerpts by default.

### SSRF

Static repository `fetch()` calls are observed, not executed. Model endpoints are configuration rather than repository-controlled URLs. Hosted Showcase target identifiers are server allowlisted.

### Malicious scanner input

Scanner adapters parse bounded caller-provided JSON semantically; they do not execute scanner-provided commands. Scanner claims remain attributed to the scanner adapter.

### Prompt injection

Repository/source content is untrusted model input. AI is downstream from deterministic evidence and cannot pass controls or gates.

### Credential disclosure

Credentials stay in server/native adapter configuration. Provider errors redact the configured credential. Credentials are prohibited in reports, logs and browser bundles.

### False assurance

`UNKNOWN` never becomes `PASS`; static support never becomes `VERIFIED`; hard gates override averages; public reports are commit/snapshot-specific.

### Docker escape

The runner drops capabilities, uses no-new-privileges, read-only source/root, bounded resources and network-off by default. Container isolation is still a residual risk; stronger sandbox runtimes may be appropriate for hostile workloads.

## Residual risks

See `limitations.md`. Drantis is an assurance evidence system, not an absolute proof of software security.
