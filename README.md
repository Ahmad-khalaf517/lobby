# Lobby

**Drop in, talk, drop out.** A lightweight link-to-join chat + voice + screen-share app. Guests use Supabase Anonymous Auth, registered users keep their existing account, and temporary rooms expire automatically.

## Stack

- **Backend:** NestJS (authentication + privileged REST operations)
- **Frontend:** Angular
- **Real-time guest data:** Supabase Realtime under guest-schema RLS
- **Voice + screen share:** [LiveKit](https://livekit.io) (open-source SFU) — Cloud free tier
- **DB:** Supabase Postgres via user-scoped browser RPC/RLS for guest data and service-role NestJS access for privileged operations
- **Shared contracts:** Zod schemas in `packages/shared`, used by both apps
- **Package manager:** pnpm (workspaces)
- **Code quality:** ESLint (flat config) + Prettier + Husky + lint-staged, enforced on commit

## Monorepo layout

```
lobby/
├── apps/
│   ├── api/                  # NestJS backend
│   └── web/                   # Angular frontend
├── packages/
│   └── shared/                 # Zod schemas, inferred types, socket event constants, mock fixtures
├── docs/
│   ├── ARCHITECTURE.md
│   ├── EVENT_CONTRACT.md
│   ├── PROJECT_PLAN.md
│   └── AI_AGENT_GUIDE.md
├── CLAUDE.md                    # AI assistant guidelines for this repo
├── AGENTS.md                    # cross-agent entrypoint for AI coding tools
├── eslint.config.js
├── .prettierrc.json
├── .husky/pre-commit
├── pnpm-workspace.yaml
└── package.json
```

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` gives you the right version automatically)
- A free [LiveKit Cloud](https://cloud.livekit.io) project (Build tier — no credit card required) for the API keys used to mint call tokens

## Setup

```bash
pnpm install
```

This installs dependencies for every workspace (`apps/*` and `packages/*`) in one pass, links `packages/shared` into both apps, and sets up the Husky git hooks (`prepare` script runs automatically).

`apps/api` and `apps/web` are already scaffolded in this repository. See `apps/api/README.md` and `apps/web/README.md` for folder ownership and implementation conventions.

## Running the apps

```bash
pnpm dev:api      # NestJS on :3000
pnpm dev:web      # Angular on :4200
pnpm dev          # both in parallel
```

### Optional Docker development

Docker can provide the project Node.js and pnpm versions without changing the local workflow. After copying `apps/api/.env.example` to `apps/api/.env` and filling in the required hosted-service credentials, run:

```bash
docker compose up --build
```

Angular is available at `http://localhost:4200` and NestJS at `http://localhost:3000`. See [Docker development](docs/docker-development.md) for networking, live reload, production targets, and troubleshooting.

## Code quality

```bash
pnpm lint          # check
pnpm lint:fix       # auto-fix
pnpm format         # prettier --write
```

A pre-commit hook runs ESLint + Prettier automatically on staged files — you don't need to remember to run these manually before committing, but you do need `pnpm install` to have run once locally so Husky is set up.

## Building

```bash
pnpm build         # builds packages/shared first, then both apps
```

## Working in parallel without blocking each other

This is the part that matters most for a 5-person team on a tight budget:

1. **The contract comes first.** `packages/shared` defines every payload shape (Zod schemas), every socket event name, and shared limits — before feature code is written. Everyone reads `docs/EVENT_CONTRACT.md` and agrees on it on day 1.
2. **Frontend doesn't wait for backend.** `packages/shared/src/mocks/fixtures.ts` exports realistic fixture data matching the real schemas. Anyone building UI can import these and build/demo against them before the real NestJS endpoint or gateway event exists.
3. **Backend doesn't wait for frontend.** Same schemas validate incoming payloads — backend people can write and test handlers against the contract without a working UI, using any REST client or a Socket.IO test client.
4. **Nobody edits someone else's owned folder.** The team table below is the source of truth for who owns what — see also `CLAUDE.md`, which an AI assistant is instructed to follow the same way.

## Where things live

| I need to...                                                       | Go to                                                                                                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/change a chat, presence, or typing event                       | `packages/shared/src/schemas` + `packages/shared/src/constants/socket-events.ts`, then `docs/EVENT_CONTRACT.md` — **not** directly in `apps/api` or `apps/web` |
| Add a NestJS module/gateway                                        | `apps/api/src/modules`                                                                                                                                         |
| Add an Angular component/service                                   | `apps/web/src/app`                                                                                                                                             |
| Understand the overall data flow, including the LiveKit token flow | `docs/ARCHITECTURE.md`                                                                                                                                         |
| Understand what an AI assistant is/isn't allowed to touch          | `CLAUDE.md`                                                                                                                                                    |

## Team

| Role                             | Owns                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Backend — Core Gateway           | `apps/api` chat/presence/typing, Supabase persistence                            |
| Backend — Infra                  | `apps/api` LiveKit call-token endpoint, LiveKit Cloud project config, deployment |
| Frontend — Chat & Channel UI     | `apps/web` channel/chat/typing UI                                                |
| Frontend — Call UI               | `apps/web` LiveKit `Room` integration, call controls                             |
| Frontend — Screen Share & Polish | `apps/web` screen share, responsive/UI polish, testing                           |

See the project plan for the hour budget, schedule, and known risks.
