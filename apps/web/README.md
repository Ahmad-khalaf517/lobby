# apps/web (Angular)

This is the Angular frontend app for the project. It handles channel/chat UI plus LiveKit voice/screen-share UX.

If you ever need to re-scaffold from scratch, use:

```bash
cd apps/web
pnpm dlx @angular/cli new . --skip-git --package-manager pnpm --style scss --routing
```

After re-scaffolding:

1. **Merge, don't overwrite,** the generated `package.json` with this folder's existing one — keep the `@lobby/shared` dependency and the `dev`/`build`/`lint`/`test` scripts already defined (Angular's `ng serve`/`ng build`/`ng test` are already mapped to them).
2. **Merge** the generated `tsconfig.json` with the one already here — keep `extends: "../../tsconfig.base.json"`.
3. Add Angular ESLint (official schematic — this wires Angular-specific lint rules on top of the root config, don't hand-write these rules):
   ```bash
   pnpm dlx ng add @angular-eslint/schematics
   ```
4. Add the runtime packages this app needs:
   ```bash
   pnpm add socket.io-client zod livekit-client
   ```
5. From the repo root, run `pnpm install` again so the workspace links `@lobby/shared` correctly.
6. Confirm `pnpm dev:web` (from the repo root) starts the dev server.

## What goes where once scaffolded

| Folder                  | Owner (see root README team table) | Contents                                                                                          |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/app/channel/`      | Frontend — Chat & Channel UI       | landing page, create/join flow, chat panel, typing indicator, member list                         |
| `src/app/call/`         | Frontend — Call UI                 | LiveKit `Room` connection, publish/subscribe audio, call controls, reconnect (handled by LiveKit) |
| `src/app/screen-share/` | Frontend — Screen Share & Polish   | screen-share track publish, responsive layout                                                     |

Every payload sent to or received from `apps/api` should be typed/validated against a schema from `@lobby/shared` — see `CLAUDE.md` at the repo root for the rule.

## Building without waiting on the backend

`@lobby/shared/mocks` exports fixture data (`mockChannel`, `mockMembers`, `mockMessages`, `mockCallTokenResponse`) matching the real schemas. Use these to build and demo components before `apps/api`'s corresponding endpoint/event exists — see the root `docs/ARCHITECTURE.md` "Parallel development" section.
