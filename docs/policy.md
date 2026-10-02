# Policy

`.drantis.yml` is parsed with a strict Zod schema. Unknown keys, invalid enums, oversized policy files and malformed YAML fail analysis rather than silently falling back.

Policy controls:

- analysis exclusions for intentional fixtures/generated artifacts;
- required assurance domains;
- severity/secret/authz/abuse requirements;
- tenant isolation and RLS requirements;
- test discovery and verified-test requirements;
- production provenance/security-header/observability requirements;
- release minimum score/coverage and hard gates;
- AI data policy/provider allowlists;
- explicitly authorized dynamic verification commands.

`inheritPolicies()` implements deterministic layering: Drantis Standard → organization → repository → branch/release. The merged result is validated again before use.


## Legacy policy compatibility

Drantis prefers `.drantis.yml`. During the rename compatibility window, `.launchproof.yml` is still accepted when the Drantis policy file is absent. If both exist, `.drantis.yml` takes precedence.
