# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/analyzers/package.json packages/analyzers/package.json
COPY packages/assurance/package.json packages/assurance/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/evidence/package.json packages/evidence/package.json
COPY packages/graph/package.json packages/graph/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/intelligence/package.json packages/intelligence/package.json
COPY packages/policies/package.json packages/policies/package.json
COPY packages/scoring/package.json packages/scoring/package.json
COPY packages/standards/package.json packages/standards/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN test -f package-lock.json || { echo 'A genuine package-lock.json is required for reproducible Docker builds.' >&2; exit 1; }
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npm run typecheck && npm run build:web

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["npm","run","start","-w","@launchproof/web"]
