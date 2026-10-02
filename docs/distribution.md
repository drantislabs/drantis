# Distribution

Drantis Core is shared across official surfaces.

## CLI

`launchproof analyze`, `verify` and `report` support JSON and SARIF output, scanner-result ingestion and CI-friendly exit codes.

## Docker

Docker Compose is the canonical self-hosted web distribution. The container is read-only, capability-dropped and non-root. Target code execution is not performed in the web container.

## Desktop

`apps/desktop` is an experimental Tauri 2 shell with a narrow native boundary. It is architected to delegate analysis to Drantis Core rather than reimplement it in Rust.

## Showcase

The hosted-compatible UI analyzes only authorized targets and controlled scenarios.

There is one normalized Drantis report model across surfaces, and no surface requires Drantis cloud or an LLM.

## Self-hosted UI repository analysis

The public Showcase surface never accepts arbitrary filesystem paths. A self-hosted operator can opt into bounded local repository analysis by setting both:

```text
LAUNCHPROOF_LOCAL_MODE=1
LAUNCHPROOF_REPOSITORY_ROOT=/absolute/path/to/allowed/projects
```

The browser then accepts only **relative** paths under that configured root. Absolute paths and traversal outside the configured root are rejected. Local web analysis remains static-only; dynamic verification is not exposed through the public web API.

For unrestricted developer-machine repository selection and native Senten/Git/Docker operations, use the Tauri desktop surface or the CLI.
