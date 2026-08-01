# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

ENV HUSKY=0
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS development

RUN apt-get update \
  && apt-get install --yes --no-install-recommends procps \
  && rm -rf /var/lib/apt/lists/*

COPY . .
RUN pnpm --filter @lobby/shared build

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["sh", "docker/dev.sh", "api"]

FROM development AS build

RUN pnpm --filter api build \
  && pnpm --filter api deploy --prod --legacy /prod/api

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /prod/api/package.json ./package.json
COPY --from=build --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
