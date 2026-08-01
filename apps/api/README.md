# apps/api (NestJS)

This is the NestJS backend app for the project. It handles REST + Socket.IO for channels/chat/presence and mints LiveKit call tokens.

If you ever need to re-scaffold from scratch, use:

```bash
cd apps/api
pnpm dlx @nestjs/cli new . --skip-git --package-manager pnpm
```

After re-scaffolding:

1. **Merge, don't overwrite,** the generated `package.json` with this folder's existing one — keep the `@lobby/shared` dependency and the `dev`/`build`/`lint` scripts already defined.
2. **Merge** the generated `tsconfig.json` with the one already here — keep `extends: "../../tsconfig.base.json"` so this app inherits the shared strict TS settings instead of Nest's defaults.
3. Add these packages for this project's actual features:
   ```bash
   pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io zod livekit-server-sdk @supabase/supabase-js @nestjs/config nanoid
   ```
4. From the repo root, run `pnpm install` again so the workspace links `@lobby/shared` correctly.
5. Copy `.env.example` to `.env` and fill in your Supabase and LiveKit keys.
6. Run `supabase/schema.sql` (repo root) in the Supabase SQL Editor to create the tables.
7. Confirm `pnpm dev:api` (from the repo root) starts the server.

## What goes where once scaffolded

| Folder                  | Owner (see root README team table) | Contents                                                          |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `src/modules/channels/` | Backend — Core Gateway             | REST controller + service + repository + mappers for channel flow |
| `src/modules/database/` | Backend — Core Gateway             | Shared DB infra only (Supabase client + row types)                |
| `src/modules/gateway/`  | Backend — Core Gateway             | Socket.IO gateway: chat, typing, presence                         |
| `src/modules/calls/`    | Backend — Infra                    | REST endpoint that mints LiveKit access tokens (planned module)   |

Every payload in and out of this app should be validated against a schema from `@lobby/shared` — see `CLAUDE.md` at the repo root for the rule and `docs/EVENT_CONTRACT.md` for the full event/endpoint list.
