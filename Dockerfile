# syntax=docker/dockerfile:1.7

# Community Docker image for running the Home Screens server off a Raspberry Pi.
# The server, editor, /remote and browser displays work. Pi features do not:
# in-app updates, restart and reboot, WiFi and hostname, screen power and
# rotation, hardware stats. Update by rebuilding or pulling the image.
# See "Running in Docker" in README.md.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY package.json package-lock.json ./
COPY scripts/copy-font-awesome.mjs ./scripts/copy-font-awesome.mjs

RUN npm install --global "npm@$(node -p 'require("./package.json").engines.npm' | tr -d '>=^~ ')" \
    && npm ci --no-audit --no-fund

COPY . ./

RUN npm run build

# Assemble the Next.js standalone runtime the same way the release tarball is
# assembled (.github/workflows/build-tarball.yml). The standalone output sweeps
# in trees the server never reads, so drop them and keep only src/translations,
# which the server reads at runtime. The two bundled CLIs back
# `npm run config:check` and the offline snapshot restore.
RUN rm -rf .next/standalone/public .next/standalone/scripts \
    && cp -r public .next/standalone/public \
    && cp -r .next/static .next/standalone/.next/static \
    && cp -r scripts .next/standalone/scripts \
    && cp .node-version .next/standalone/.node-version \
    && rm -rf .next/standalone/website .next/standalone/docs .next/standalone/e2e \
        .next/standalone/RELEASE_NOTES .next/standalone/infrastructure \
        .next/standalone/image-creation .next/standalone/mockups \
    && find .next/standalone/src -mindepth 1 -maxdepth 1 ! -name translations -exec rm -rf {} + \
    && test -f .next/standalone/src/translations/en-US/core.json \
    && npx esbuild scripts/check-config.ts --bundle --platform=node --format=cjs \
        --outfile=.next/standalone/scripts/check-config.cjs --log-level=warning \
    && npx esbuild scripts/restore-snapshot.ts --bundle --platform=node --format=cjs \
        --outfile=.next/standalone/scripts/restore-snapshot.cjs --log-level=warning \
    && mkdir -p .next/standalone/data \
    && test -f .next/standalone/server.js

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    UV_THREADPOOL_SIZE=8 \
    NEXT_TELEMETRY_DISABLED=1 \
    HS_DISABLE_AUTO_UPDATE=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /src/.next/standalone ./

RUN mkdir -p data public/backgrounds \
    && chown -R node:node data public/backgrounds

USER node

VOLUME ["/app/data", "/app/public/backgrounds"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/config').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
