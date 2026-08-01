# AI Assistant Guidelines (CLAUDE.md)

This file tells any AI coding assistant (Claude, Copilot, etc.) working in this repo how to behave. Read this before generating or editing code here.

## What this project is

A no-auth, link-to-join chat app with voice calls (via LiveKit) and screen sharing. NestJS backend, Angular frontend, pnpm workspace monorepo, built by a 5-person team on a 100-hour budget. See the root `README.md` for structure and `docs/ARCHITECTURE.md` for the full data flow.

## Golden rule: shared contracts are not yours to improvise

`packages/shared` (Zod schemas + inferred types + socket event constants) is the single source of truth for every payload that crosses the frontend/backend boundary.

- **Never** define a duplicate type or interface in `apps/api` or `apps/web` for something that already has a schema in `packages/shared`. Import it instead.
- **Never** invent a new socket event name inline (`socket.emit('someNewEvent', ...)`). All event names live in `packages/shared/src/constants/socket-events.ts`. If a needed event doesn't exist yet, add it there first, update `docs/EVENT_CONTRACT.md` in the same change, and only then use it in `apps/api`/`apps/web`.
- If a change to `packages/shared` would alter an existing schema's shape (not just add a new one), flag it clearly in your response before making it — it affects both apps and possibly a teammate's in-progress work.
- When you don't have a real backend/frontend counterpart to test against yet, use `packages/shared/src/mocks/fixtures.ts` rather than inventing throwaway sample data — keeps everyone's test data consistent with the real schemas.

## Scope discipline

- Stick to the module/role you were asked to help with (see the team table in `README.md`). Don't refactor unrelated files "while you're in there" — five people are working in parallel and unrequested changes elsewhere cause merge conflicts.
- When scaffolding something new (a NestJS module, an Angular component), follow the existing folder/naming conventions already present in `apps/api/src` or `apps/web/src/app` rather than introducing a new pattern.
- Don't add a new npm dependency without saying so explicitly in your response and why it's needed — free/open-source only, nothing that requires a paid tier or API key for its core function.

## Restrictions specific to this project

- **No video calls** — audio-only voice + screen share, by design. Don't add camera/video tracks.
- **Calls go through LiveKit, not raw WebRTC.** Don't hand-roll `RTCPeerConnection` signaling logic in `apps/api` or `apps/web` — that was the old approach and has been intentionally replaced. Use the LiveKit client SDK (`livekit-client`) on the frontend and `livekit-server-sdk` for token minting on the backend.
- **`apps/api` never touches call media**, only issues short-lived LiveKit access tokens via REST. There is no socket event for joining a call — don't add one.
- **Use LiveKit Cloud's free "Build" tier**, not self-hosted — this project intentionally avoids operating its own media server. Don't add coturn, mediasoup, or a self-hosted LiveKit deployment unless explicitly asked.
- **No authentication system** — display name + channel link only. Don't add login/JWT-for-users/session auth unless explicitly asked to change this. (The LiveKit access token is a call-specific credential, not a user auth system — don't conflate the two.)
- Chat history is in-memory/session-scoped by design; only channel metadata (id, name, createdAt) is persisted to SQLite. Don't silently expand what's persisted.
- The soft cap on call participants (`MAX_CALL_PARTICIPANTS` in `packages/shared`) is a product decision enforced in the token-minting endpoint, not a technical WebRTC limitation — don't remove the enforcement without being asked, and don't confuse it with a hard SDK limit when explaining it.

## Code quality — non-negotiable, not a suggestion

- TypeScript strict mode throughout (`apps/api`, `apps/web`, `packages/shared`) — don't weaken `tsconfig.base.json`'s strictness in an app-level override.
- ESLint (`eslint.config.js` at the root) and Prettier (`.prettierrc.json`) configs apply to every workspace. Don't introduce a per-package override unless there's a real, stated reason.
- A Husky pre-commit hook runs lint-staged automatically. Don't tell a user to bypass it (`--no-verify`) to "save time" — if lint is failing, fix the lint error, don't skip the check.
- Prefer explicit types over `any`; if a shared schema exists for the data, use its inferred type rather than writing a new one.

## Before considering a task done

- Run `pnpm lint` and, if tests exist for the touched package, `pnpm test`.
- If you touched `packages/shared`, run `pnpm build` at the root to confirm both apps still typecheck against it.
- Mention in your response if you touched the event contract, added a dependency, or changed a shared schema's shape — these are the changes most likely to need a teammate's heads-up.

## Known risk areas — be extra careful here

These areas are called out in the project plan as the most likely to eat unplanned time. If you're generating code for these, be conservative and flag uncertainty rather than guessing:

- The LiveKit token-minting endpoint (room name conventions, token expiry, permissions granted)
- First-time integration of the LiveKit client SDK into the Angular Call UI (this is new to the team — don't assume familiarity)
- The `typing` event's debounce/timeout behavior (avoid spamming the socket on every keystroke)
