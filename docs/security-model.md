# Security Model

Drantis treats both repositories and analysis extensions as security-sensitive inputs. Safe defaults are no execution, no external source transmission, fail-closed policy parsing, redacted credential findings, evidence provenance, deterministic gates, and explicit certainty.

Hosted deployments should add authentication, tenant-isolated persistence, request/body limits, CSRF protections where state changes exist, per-principal rate limits, audit logs, and worker isolation before accepting arbitrary private repositories.

## Public Showcase request boundary

Public endpoints use bounded JSON bodies, sanitized public error messages, no-store responses for detailed reports, and an in-memory abuse limiter. Client IP headers are **not** trusted automatically. Operators behind a trusted proxy may set `LAUNCHPROOF_CLIENT_IP_HEADER` (for example `cf-connecting-ip`) so the limiter keys by the proxy-authenticated client identity. Without that setting, requests share an anonymous bucket rather than trusting spoofable forwarding headers. High-scale/multi-instance deployments should replace the in-memory limiter with a shared backend.
