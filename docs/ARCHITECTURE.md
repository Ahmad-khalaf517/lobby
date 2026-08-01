# Architecture

## Monorepo layout

```
lobby/
├── apps/
│   ├── api/                          # NestJS
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── app/              # app feature module + app controller/service
│   │   │   │   ├── channels/         # REST + service + repository + mappers for channel flow
│   │   │   │   ├── database/         # Shared DB infra (Supabase client + row types)
│   │   │   │   ├── gateway/          # Socket.IO gateway: chat, typing, presence
│   │   │   │   └── calls/            # REST: mints LiveKit access tokens
│   │   │   └── main.ts
│   │   ├── package.json
│   │   └── tsconfig.json             # extends ../../tsconfig.base.json
│   │
│   └── web/                          # Angular
│       ├── src/app/
│       │   ├── channel/              # channel view, chat panel, member list
│       │   ├── call/                 # LiveKit Room integration, call controls
│       │   └── screen-share/
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                       # imported as @lobby/shared
│       ├── src/
│       │   ├── schemas/              # Zod schemas — SOURCE OF TRUTH
│       │   │   ├── channel.schema.ts
│       │   │   ├── chat.schema.ts
│       │   │   ├── typing.schema.ts
│       │   │   ├── presence.schema.ts
│       │   │   └── call.schema.ts    # LiveKit token request/response
│       │   ├── constants/
│       │   │   ├── socket-events.ts  # event name constants, shared by both apps
│       │   │   └── limits.ts         # name/message length caps, call participant cap
│       │   ├── mocks/
│       │   │   └── fixtures.ts       # fixture data for parallel/contract-first dev
│       │   └── index.ts              # re-exports everything
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   ├── ARCHITECTURE.md               # this file
│   ├── EVENT_CONTRACT.md
│   ├── PROJECT_PLAN.md
│   └── AI_AGENT_GUIDE.md
├── CLAUDE.md
├── README.md
├── eslint.config.js
├── .prettierrc.json
├── .husky/pre-commit
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## Why one shared package instead of three

It's tempting to split `shared-types`, `shared-validation`, and `shared-constants` into separate packages. For a 5-person team on a tight hour budget, that's three `package.json` files and three build outputs to keep in sync for no real benefit — a single `packages/shared` with clearly named subfolders gives the same separation of concerns with a fraction of the config overhead.

## Why Zod specifically

NestJS conventionally validates with `class-validator` decorators on DTO classes. That works backend-only — those decorator-based classes don't translate cleanly into something Angular can reuse for client-side validation, so you'd end up hand-maintaining a second, parallel definition of every payload shape on the frontend.

Zod schemas are plain TypeScript, run identically in Node and the browser, and give you both a runtime validator and a static type from one definition:

```typescript
// packages/shared/src/schemas/chat.schema.ts
export const ChatMessagePayloadSchema = z.object({
  channelId: z.string(),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  text: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});
export type ChatMessagePayload = z.infer<typeof ChatMessagePayloadSchema>;
```

- **In NestJS:** validate with `ChatMessagePayloadSchema.parse(payload)` inside the gateway handler / a Zod validation pipe.
- **In Angular:** the same schema validates a form before emitting, and the inferred type types the service methods — no separate interface to maintain.

## Data flow

Two structurally different real-time paths exist in this app — don't conflate them:

### 1. Application events (chat, typing, presence) — via Socket.IO, through apps/api

```
Angular (apps/web) <──Socket.IO──> NestJS (apps/api) <──> Supabase (channels + messages)
```

NestJS is an active participant here: it persists chat to Supabase and broadcasts the stored row, and tracks typing state and presence in memory. Every payload is validated against a `packages/shared` schema on both ends.

### 2. Voice calls + screen share — via LiveKit, NOT through Socket.IO

```
Angular (apps/web) ──REST──> NestJS (apps/api) ──mints token──> (nothing stored)
        │
        └──LiveKit client SDK, using the token──> LiveKit Cloud (SFU)
                                                          │
                                            media flows directly between
                                            participants' browsers via LiveKit
```

The flow, step by step:

1. Angular calls `POST /channels/:channelId/call-token` on NestJS with the participant's name.
2. NestJS uses `livekit-server-sdk` to mint a short-lived access token scoped to a room named after the channel, and returns `{ token, livekitUrl, roomName }` (see `CallTokenResponseSchema`).
3. Angular connects directly to LiveKit Cloud using `livekit-client`'s `Room.connect(livekitUrl, token)` — NestJS is not involved from this point on.
4. Audio and screen-share tracks are published/subscribed through LiveKit's SFU. Reconnection-on-drop is handled by the LiveKit client SDK internally — this app does not implement its own reconnect logic for calls.

**apps/api never sees or touches call media** — its only responsibility in the call path is minting the token. This is why there's no `webrtcSignal` socket event in this project: LiveKit's own client-to-server protocol replaces the hand-rolled signaling relay a raw-WebRTC-mesh approach would have needed.

## Parallel development without blocking

With five people building simultaneously against two apps that don't exist as working software yet on day 1, the shared package is what prevents everyone from blocking on everyone else:

- **The schemas are the spec.** Once `docs/EVENT_CONTRACT.md` is agreed on day 1, every payload shape is fixed in `packages/shared` — a frontend dev doesn't need the real backend running to know exactly what shape of data they'll receive.
- **`packages/shared/src/mocks/fixtures.ts`** provides real, schema-valid sample data (`mockChannel`, `mockMembers`, `mockMessages`, `mockCallTokenResponse`). The Chat/Channel UI and Call UI roles can build and visually test their components against these fixtures before the corresponding NestJS endpoint or gateway handler exists.
- **Backend roles work the same way in reverse** — they can write and test a handler against the Zod schema and fixture data without a working Angular UI to click through, using any REST client or a Socket.IO test client/script.
- **Ownership boundaries are explicit** (see the team table in `README.md`) so parallel work doesn't collide on the same files. The only shared surface anyone touches is `packages/shared` itself, which is exactly why changes there get flagged in `CLAUDE.md`.

## Build order

`packages/shared` has no dependency on either app, so it always builds first:

```bash
pnpm build   # runs packages/shared build, then apps/api and apps/web in parallel
```

Both apps reference it via the pnpm workspace protocol in their `package.json`:

```json
{
  "dependencies": {
    "@lobby/shared": "workspace:*"
  }
}
```

pnpm resolves `workspace:*` to a symlink into `packages/shared` — no publishing to npm, no version bumping during development.

## Code quality tooling

- **ESLint** (`eslint.config.js`, flat config) — shared base rules for all workspaces; `apps/api/eslint.config.mjs` and `apps/web/eslint.config.mjs` extend root with app-specific parser options.
- **Prettier** (`.prettierrc.json`) — formatting only; `eslint-config-prettier` disables any ESLint rule that would conflict with it.
- **Husky + lint-staged** — a pre-commit hook (`.husky/pre-commit`) runs ESLint (`--fix`) and Prettier on staged files automatically, so formatting/lint issues never reach a commit.
