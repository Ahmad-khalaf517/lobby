# apps/api (NestJS)

This folder is a placeholder wired into the pnpm workspace and the shared package. Scaffold the real NestJS app here using the official CLI rather than hand-writing the boilerplate:

```bash
cd apps/api
pnpm dlx @nestjs/cli new . --skip-git --package-manager pnpm
```
test
After scaffolding:

1. **Merge, don't overwrite,** the generated `package.json` with this folder's existing one — keep the `@lobby/shared` dependency and the `dev`/`build`/`lint` scripts already defined.
2. **Merge** the generated `tsconfig.json` with the one already here — keep `extends: "../../tsconfig.base.json"` so this app inherits the shared strict TS settings instead of Nest's defaults.
3. Add these packages for this project's actual features:
   ```bash
   pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io zod livekit-server-sdk @nestjs/typeorm typeorm sqlite3 nanoid
   ```
4. From the repo root, run `pnpm install` again so the workspace links `@lobby/shared` correctly.
5. Confirm `pnpm dev:api` (from the repo root) starts the server.

## What goes where once scaffolded

| Folder | Owner (see root README team table) | Contents |
|---|---|---|
| `src/channels/` | Backend — Core Gateway | REST: create/join channel, SQLite persistence |
| `src/gateway/` | Backend — Core Gateway | Socket.IO gateway: chat, typing, presence |
| `src/calls/` | Backend — Infra | REST endpoint that mints LiveKit access tokens |

Every payload in and out of this app should be validated against a schema from `@lobby/shared` — see `CLAUDE.md` at the repo root for the rule and `docs/EVENT_CONTRACT.md` for the full event/endpoint list.
