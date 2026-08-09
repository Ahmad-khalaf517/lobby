# apps/api (NestJS)

The API owns Supabase Auth session exchange, privileged registered-application modules, and LiveKit token minting. It is not in the guest chat or media data path.

## Local setup

Copy `.env.example` to `.env`, configure the server-only Supabase and LiveKit values, then run from the repository root:

```bash
pnpm install
pnpm dev:api
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` to `apps/web`.

## Module boundaries

- `src/modules/auth`: registered and anonymous auth/session lifecycle.
- `src/modules/calls`: protected, membership-authorized LiveKit tokens and call status.
- `src/modules/database`: composed generated public/guest database types and server clients.
- `src/modules/app`, `src/modules/servers`: registered application functionality.

Guest create/join/chat/reaction/leave/close operations are database RPCs invoked by the user-scoped Angular Supabase client. See `docs/EVENT_CONTRACT.md`.
