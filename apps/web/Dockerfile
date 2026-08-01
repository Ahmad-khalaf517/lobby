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

ENV NG_ALLOWED_HOSTS=localhost,127.0.0.1

COPY . .
RUN pnpm --filter @lobby/shared build

EXPOSE 4200
CMD ["sh", "docker/dev.sh", "web", "--host", "0.0.0.0", "--poll", "1000", "--proxy-config", "proxy.docker.json"]

FROM development AS build

RUN pnpm --filter web build \
  && pnpm --filter web deploy --prod --legacy /prod/web

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production \
    NG_ALLOWED_HOSTS=localhost,127.0.0.1 \
    PORT=4000
WORKDIR /app

COPY --from=build --chown=node:node /prod/web/package.json ./package.json
COPY --from=build --chown=node:node /prod/web/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/web/dist ./dist

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/client/server/server.mjs"]
