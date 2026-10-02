# AI Data Governance

Repository source is sensitive.

Drantis enforces four transmission policies before an `IntelligenceProvider` is called:

- **Evidence Only:** normalized evidence/findings/graph/cases only; source excerpts are removed.
- **Relevant Context:** at most eight bounded source excerpts required for the task.
- **Extended Context:** broader but still bounded explicitly authorized context.
- **Local Only:** external providers are rejected.

An optional provider allowlist can further restrict model adapters.

Credentials are adapter configuration, not analysis data. They must remain server/native-side and are never copied into evidence, findings, reports, exports or browser bundles. Provider error bodies are credential-redacted before surfacing.

## Provider network boundary

External provider endpoints are validated before transmission. By default they must use HTTPS and cannot target obvious loopback, link-local, RFC1918/private literal addresses or known metadata hostnames. Embedded URL credentials are rejected. Ollama/local providers may use loopback HTTP. Gemini credentials are sent in a request header rather than the URL.

URL validation cannot by itself defeat DNS rebinding or prove ownership of a hostname. Deployments with strict SSRF requirements should enforce egress policy at the network/runtime layer as well. A provider marked `local` is an operator trust designation; Drantis cannot prove that remote infrastructure is user-controlled.
