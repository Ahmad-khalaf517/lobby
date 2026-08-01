# AGENTS.md

Repository-wide instructions for AI coding agents.

If your agent supports only one instruction file, treat this file as the entry point.

## Primary References

1. `CLAUDE.md` — authoritative behavior and safety rules for this repository.
2. `docs/AI_AGENT_GUIDE.md` — cross-agent implementation workflow for Copilot/OpenAI/Codex-style assistants.
3. `docs/EVENT_CONTRACT.md` — required event/endpoint contract updates.
4. `docs/ARCHITECTURE.md` — backend/frontend data flow and design boundaries.

## Non-Negotiables

1. Do not invent socket event names; use `packages/shared/src/constants/socket-events.ts`.
2. Do not duplicate shared payload types outside `packages/shared`.
3. Do not access Supabase directly from `apps/web`.
4. Do not expose server secrets (especially `SUPABASE_SERVICE_ROLE_KEY`).
5. Keep API module work under `apps/api/src/modules` and keep changes scoped.

## Validation Baseline

Run the relevant checks before finalizing:

```bash
pnpm lint
pnpm --filter api exec tsc -p tsconfig.json --noEmit
```

If `packages/shared` changes, also run:

```bash
pnpm build
```
