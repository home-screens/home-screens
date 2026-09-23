# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY package.json package-lock.json ./
COPY scripts/copy-font-awesome.mjs ./scripts/copy-font-awesome.mjs

RUN npm install --global npm@11.6.3 \
    && npm ci --no-audit --no-fund

COPY . ./

RUN npm run build

# Assemble the Next.js standalone runtime.
RUN cp -r public .next/standalone/public \
    && cp -r .next/static .next/standalone/.next/static \
    && rm -rf .next/standalone/scripts \
    && cp -r scripts .next/standalone/scripts \
    && mkdir -p .next/standalone/data \
    && test -f .next/standalone/server.js

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

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
