# AI Agent Collaboration Guide

This guide is for AI coding agents working in this repository (GitHub Copilot, OpenAI/Codex-based agents, Claude, and similar tools).

The goal is consistent, safe changes regardless of which assistant is used.

## 1) Start Here

1. Read `README.md` for project scope and ownership boundaries.
2. Read `CLAUDE.md` for non-negotiable rules in this repo.
3. Read `docs/EVENT_CONTRACT.md` before changing any API/socket payloads.
4. Read `docs/ARCHITECTURE.md` before touching chat/call data flows.

## 2) Shared Contract Rules (Critical)

1. `packages/shared` is the single source of truth for cross-boundary payloads.
2. Do not duplicate shared types in `apps/api` or `apps/web`.
3. Do not hardcode socket event names; use `SOCKET_EVENTS`.
4. If you add/change an event name, update in the same change:
   - `packages/shared/src/constants/socket-events.ts`
   - `docs/EVENT_CONTRACT.md`
   - all call sites in backend and frontend
5. If you change a shared schema shape, clearly call it out in your final summary.

## 3) Backend Boundaries

1. `apps/api` handles REST + Socket.IO app events + Supabase access.
2. LiveKit media does not pass through `apps/api`; backend only mints short-lived tokens.
3. No user auth system (no login/JWT session flow) unless explicitly requested.
4. Keep Supabase access server-side only; never add Supabase client usage in `apps/web`.
5. Map DB snake_case rows to camelCase contract objects via feature-local mappers (for channels: `apps/api/src/modules/channels/channels.mappers.ts`).

## 4) Frontend Boundaries

1. `apps/web` talks to `apps/api`, not directly to Supabase.
2. Validate/shape payloads against shared schemas before emitting/processing.
3. Keep call UI on LiveKit client SDK; do not build custom WebRTC signaling.

## 5) Folder Conventions

1. API modules live under `apps/api/src/modules`.
2. App-level composition remains in `apps/api/src/app.module.ts`.
3. App feature internals live in `apps/api/src/modules/app`.
4. Keep changes scoped; avoid unrelated refactors.

## 6) Quality Gates Before Done

Run, at minimum:

```bash
pnpm lint
```

If you touched `apps/api`:

```bash
pnpm --filter api exec tsc -p tsconfig.json --noEmit
```

If you touched `packages/shared`:

```bash
pnpm build
```

If tests exist for touched packages, run them and report results.

## 7) Security Guardrails

1. Never commit secrets or `.env` values.
2. Never expose `SUPABASE_SERVICE_ROLE_KEY` to frontend code or docs.
3. Prefer least privilege and explicit validation at boundaries.

## 8) Suggested Final Response Format

When your task is complete, summarize:

1. What changed (files + purpose).
2. Any contract changes (schemas/events/endpoints).
3. Validation commands run and results.
4. Risks, tradeoffs, or follow-up suggestions.

This keeps handoffs clear across humans and different AI tools.
