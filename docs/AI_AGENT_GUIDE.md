# AI Agent Collaboration Guide

This guide is for AI coding agents working in this repository (GitHub Copilot, OpenAI/Codex-based agents, Claude, and similar tools).

The goal is consistent, safe changes regardless of which assistant is used.

## 1) Start Here

1. Read `README.md` for project scope and ownership boundaries.
2. Read `CLAUDE.md` for non-negotiable rules in this repo.
3. Read `docs/EVENT_CONTRACT.md` before changing any API or RPC payloads.
4. Read `docs/ARCHITECTURE.md` before touching chat/call data flows.

## 2) Shared Contract Rules (Critical)

1. `packages/shared` is the single source of truth for cross-boundary payloads.
2. Do not duplicate shared types in `apps/api` or `apps/web`.
3. Guest chat has no Socket.IO path; do not add one without an explicit architecture change.
4. If you add or change an endpoint/RPC contract, update `docs/EVENT_CONTRACT.md` and all call sites in the same change.
5. If you change a shared schema shape, clearly call it out in your final summary.

## 3) Backend Boundaries

1. `apps/api` handles authentication, privileged REST operations, and LiveKit token minting.
2. LiveKit media does not pass through `apps/api`; backend only mints short-lived tokens.
3. Angular restores and refreshes registered and anonymous sessions through its singleton public-key Supabase client. NestJS continues to support HttpOnly-cookie sessions for API/Postman testing.
4. Service-role Supabase access stays server-side. The browser may use its public key and user JWT for the `guest` schema only.
5. Map DB snake_case rows to camelCase contract objects via feature-local mappers when data crosses a NestJS contract boundary.

## 4) Frontend Boundaries

1. `apps/web` uses its singleton Supabase client for browser authentication and user-scoped reads, RPCs, and Realtime; it uses NestJS Bearer-authenticated endpoints for privileged operations.
2. Validate API payloads against shared schemas and use generated database types for guest data.
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
