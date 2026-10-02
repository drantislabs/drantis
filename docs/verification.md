# Verification expectations

Drantis distinguishes **implemented code** from a **verified release candidate**. A release is not complete until the complete matrix below actually runs successfully in an environment with the required dependencies, browser tooling, Docker and—when desktop packaging is in scope—Rust/Tauri prerequisites.

```text
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build -w @launchproof/web
npx playwright install --with-deps chromium
npm run test:e2e
npm run cli -- analyze scenarios/production-reference --json /tmp/launchproof-report.json
docker build -t launchproof .
```

For authorized dynamic verification, use a policy that explicitly enables verification, declares verification commands and images; the host independently allowlists the exact pinned image, and run:

```text
npm run cli -- verify <repository> --allow-execution --runner-image sha256:<image-id>
```

Verification is fail-closed. A missing authorization flag, unavailable runner, unsupported restricted-egress mode or disallowed image cannot be downgraded into `VERIFIED` evidence.

## Restricted-environment verification

The repository includes `tsconfig.offline.json` and `scripts/offline-smoke.mts` so the dependency-light deterministic engine can still be checked in environments where package retrieval is unavailable. Those checks are valuable but are **not substitutes** for the release matrix above.

CI intentionally fails if `package-lock.json` is absent. The lockfile must be produced by a real npm install and committed; it must never be manually invented just to make CI appear reproducible.

Every verification report should record the exact commit, policy version, Drantis version, analyzers and timestamp. A successful report applies only to that analyzed snapshot and does not constitute permanent security certification.
