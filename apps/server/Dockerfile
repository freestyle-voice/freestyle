# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build the standalone Freestyle server.
#
# The server is a workspace package, so we install + build it from the repo
# root, then use `pnpm deploy` to produce a self-contained directory (its
# own node_modules with only production dependencies) for the runtime image.
#
# Released images are published to ghcr.io/freestyle-voice/freestyle-server
# (tagged with each release version and :latest). To build locally instead,
# run from the repository root:
#   docker build -f apps/server/Dockerfile -t freestyle-server .
# Run (open):
#   docker run -p 4649:4649 -v freestyle-data:/data freestyle-server
# Run (require a bearer token):
#   docker run -p 4649:4649 -v freestyle-data:/data \
#     -e FREESTYLE_AUTH_TOKEN=your-secret freestyle-server
# ---------------------------------------------------------------------------

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo

# Copy the whole monorepo (see .dockerignore for exclusions) so workspace
# package manifests are available for resolution.
COPY . .

# Install only what the server needs and skip lifecycle scripts (the Electron
# app's postinstall rebuilds native modules we don't need here).
RUN pnpm install --frozen-lockfile --filter @freestyle/server... --ignore-scripts

# Build the server bundle (workspace deps are inlined by pkgroll).
RUN pnpm --filter @freestyle/server build

# Produce a self-contained deployment with production deps only.
RUN pnpm --filter @freestyle/server deploy --prod --legacy /app

# ---------------------------------------------------------------------------
# Runtime image
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    FREESTYLE_ENV=production \
    FREESTYLE_DB_PATH=/data/freestyle.db \
    HOST=0.0.0.0 \
    PORT=4649

WORKDIR /app
COPY --from=build /app ./

# SQLite database lives on a volume so it survives container restarts.
# Owned by the unprivileged `node` user the container runs as.
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]

EXPOSE 4649

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4649)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/startup.js"]
