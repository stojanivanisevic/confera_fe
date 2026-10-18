# Production image of the Confera web application (M4-FE-05; ADR-20, ADR-24, ADR-26).
#
#   docker build -t confera-web .
#
# - Both stages start from the same base image, referenced by digest (ADR-01).
# - The build stage makes the production build (no dev pages: no gallery, no harness, no spike
#   fixtures) and refuses to finish unless `verify:build` passes: the route list equals the
#   declared routes of routes.json, no dev-only text, no public source map, the framework settings
#   of ADR-20 (ST-02, frontend part).
# - The runtime image holds Next's standalone server and the files it traced, the static files,
#   and nothing else: no source of the workspace, no test, no development dependency, no package
#   manager. It runs as `node` (uid 1000) on a read-only root file system, with /tmp and the
#   framework's cache directory mounted by the compose file of confera_be (deploy/compose.yml).
# - It holds no secret and is given none: the web application only renders and forwards (ADR-20).

# ---------------------------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------------------------
# Node.js 22.23.3 on Debian 12 (bookworm), slim. The digest is the multi-platform index.
FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_HOME=/opt/corepack \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/embed-loader/package.json packages/embed-loader/package.json
COPY packages/form-renderer/package.json packages/form-renderer/package.json
COPY packages/template-editor/package.json packages/template-editor/package.json
COPY packages/ui/package.json packages/ui/package.json
# pnpm 11.28.2 comes from corepack, checked against the hash in package.json.
RUN corepack pnpm install --frozen-lockfile
COPY tsconfig.base.json tsconfig.json ./
COPY scripts/next.mjs scripts/lib.mjs scripts/listen-host.mjs scripts/verify-build.mjs scripts/
COPY design-system design-system
COPY packages packages
COPY apps/web apps/web
RUN CONFERA_STANDALONE=1 node scripts/next.mjs build \
 && node scripts/verify-build.mjs

# ---------------------------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------------------------
FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS runtime
ARG CONFERA_REVISION=unknown
LABEL org.opencontainers.image.title="confera-web" \
      org.opencontainers.image.description="Confera web application (UdEkoM Balkans)" \
      org.opencontainers.image.source="https://github.com/stojanivanisevic/confera_fe" \
      org.opencontainers.image.revision="${CONFERA_REVISION}" \
      org.opencontainers.image.licenses="UNLICENSED"
# HOSTNAME is the address Next's standalone server listens on: inside its container, every
# address (ADR-24: 0.0.0.0 on prod). Telemetry off (ADR-20).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# The package managers of the base image are development tools: the runtime image has none.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
COPY --from=build --chown=root:root /build/apps/web/.next/standalone ./
COPY --from=build --chown=root:root /build/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
