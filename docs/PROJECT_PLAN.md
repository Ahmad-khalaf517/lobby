# Lobby Project Plan (Updated — LiveKit version)

**Stack:** NestJS (backend) + Angular (frontend) | **Team size:** 5 | **Auth:** None (name + channel link only) | **Budget:** 100 working hours total, ~5 hrs/day per person

---

## 1. Core Concept & Flow

1. User opens the app → enters a display name (no login, stored client-side for the session)
2. User clicks **Create Channel** → backend generates a short unique ID → returns a shareable link (`yourapp.com/channel/abc123`)
3. Creator lands in the channel; other users open the link, enter their name, and join the same room
4. Inside a channel, members can:
   - Send text messages (real-time chat)
   - See a typing indicator when someone else is composing a message
   - Start a voice call (via LiveKit — soft cap of 8 participants, not a hard technical limit), with reconnect handled by the LiveKit client SDK
   - Share their screen
   - See who's online/in the channel
5. Channels are persisted (survive a server restart); a channel disappears only if explicitly deleted or expired, not on restart

---

## 2. Feature List (grouped by priority)

### Must-have (MVP — required to demo)

- Enter name, no auth
- Create channel → get shareable link/ID
- Join channel via link
- Real-time text chat scoped to the channel
- Typing indicator ("X is typing...")
- Message timestamps / grouping by sender
- Show list of members currently in the channel
- Join/leave notifications ("X joined", "X left")
- Voice call via LiveKit (audio only — no video), soft cap of 8 participants
- Screen sharing (via LiveKit track publish)
- Reconnect handling — provided by the LiveKit client SDK, not hand-rolled
- Basic UI: channel view, chat panel, member list, call controls (mute, leave call)
- Persist channels **and full chat history** in Supabase (new members joining a room see prior messages)

### Should-have (do if on pace)

- Mute/unmute toggle
- Copy-link button + toast confirmation
- Basic responsive design
- Dark mode

### Nice-to-have (cut first if hours run short)

- Channel name collision handling for duplicate display names
- Emoji reactions

---

## 3. Libraries & Tools

| Purpose                     | Library                                                                                | Notes                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Backend framework           | **NestJS**                                                                             | Already decided                                                                                                                           |
| Frontend framework          | **Angular**                                                                            | Already decided                                                                                                                           |
| Real-time chat/presence     | **Socket.IO** (`@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io-client`) | Chat, typing, presence only — calls do NOT go through this                                                                                |
| Voice call & screen share   | **LiveKit** (`livekit-client`, `livekit-server-sdk`) — Cloud free "Build" tier         | Open-source SFU; scales past 4 people with no extra code; handles reconnect internally; free tier covers this project's usage comfortably |
| Unique channel IDs          | **nanoid**                                                                             | Short, URL-safe IDs                                                                                                                       |
| Persistence                 | **Supabase** (Postgres) + `@supabase/supabase-js`                                      | Stores channels and full message history; schema in `supabase/schema.sql`. Frontend never touches it directly — all access via NestJS     |
| Shared contracts            | **Zod** (`packages/shared`)                                                            | Single schema definition validated on both NestJS and Angular — see Section 8                                                             |
| Styling                     | **Angular Material** or **Tailwind CSS**                                               | Speeds up UI work significantly                                                                                                           |
| State management (frontend) | Angular services + RxJS (`BehaviorSubject`)                                            | No need for NgRx at this scale                                                                                                            |
| Code quality                | **ESLint (flat config) + Prettier + Husky + lint-staged**                              | Enforced automatically on commit — see Section 9                                                                                          |
| Dev assistance              | **AI coding assistant** (e.g. Claude Code, GitHub Copilot)                             | Scaffolds boilerplate, unblocks edge cases — see `CLAUDE.md` for the rules it follows in this repo                                        |

---

## 4. Suggested Architecture

Two structurally different real-time paths — see `docs/ARCHITECTURE.md` for the full diagram and reasoning:

```
Chat / typing / presence:
  Angular <──Socket.IO──> NestJS <──> Supabase (channels + messages)

Calls (voice + screen share):
  Angular ──REST (call-token)──> NestJS ──mints token, stores nothing──> (done)
  Angular ──LiveKit client SDK, using that token──> LiveKit Cloud (SFU)
                                                            │
                                     media flows directly between participants
                                     via LiveKit — NestJS is not involved
```

`apps/api` never touches call media — its only job in the call path is minting a short-lived LiveKit access token.

---

## 5. Team Split & Hour Budget (5 people, 100 hours total)

| Role                                    | Responsibilities                                                                                                                                | Hours |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **1. Backend — Core Gateway**           | NestJS Socket.IO gateway: create/join channel, chat + typing events, presence (join/leave), member list, Supabase persistence                   | ~17   |
| **2. Backend — Infra**                  | LiveKit call-token REST endpoint (`livekit-server-sdk`), LiveKit Cloud project setup, deployment/hosting config                                 | ~11   |
| **3. Frontend — Chat & Channel UI**     | Landing page (name entry), create/join channel flow, chat UI, typing indicator, message grouping/timestamps, member list, join/leave toasts     | ~19   |
| **4. Frontend — Call UI**               | LiveKit `Room` integration (connect, publish/subscribe audio), call controls (mute, leave) — reconnect is handled by the SDK, not built by hand | ~15   |
| **5. Frontend — Screen Share & Polish** | Screen share via LiveKit track publish, responsive/UI polish, dark mode, README + demo prep, integration testing across all features            | ~18   |

**Total allocated: ~80 hours.** The remaining **~20 hours are buffer**, reserved for the team's first-time integration of the LiveKit SDK — not pre-committed to more features. If the team is clearly ahead of schedule by Day 3, pull from this buffer for a Nice-to-have (Section 2), not before.

Person 1 and 2 should sync closely (same NestJS app, different modules). Person 3 and 4 similarly share the channel component shell.

---

## 6. Suggested Schedule (4 days, ~5 hrs/day/person = 100 total)

| Day       | Backend — Core Gateway                                                                                                                                                                                   | Backend — Infra                                                                         | Frontend — Chat/Channel                                                                                                                                                      | Frontend — Calls                                                                                                 | Frontend — Screen Share/Polish                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Day 1** | Repo scaffolding (`apps/api` via Nest CLI, see `apps/api/README.md`), lock the event contract (`docs/EVENT_CONTRACT.md`), Supabase project + `schema.sql` applied, `createChannel`/`joinChannel` working | LiveKit Cloud project created, call-token endpoint skeleton, test-mint a token manually | Angular routing (`apps/web` via Angular CLI, see `apps/web/README.md`), name-entry screen, create/join UI — build against `packages/shared` mocks if backend isn't ready yet | LiveKit client SDK installed, connect to a test room using a manually-minted token                               | Screen share API research (LiveKit track publish), basic layout/shell components    |
| **Day 2** | Chat + typing events, presence broadcast; persistence tested (restart server, channel still resolves)                                                                                                    | Call-token endpoint wired to real channel IDs, soft participant cap enforced            | Chat UI, typing indicator, message timestamps/grouping, member list rendering, join/leave toasts                                                                             | 1:1 voice call working end-to-end through LiveKit — **test across two different real networks today, not later** | Screen share button + track swap into call UI; start responsive styling + dark mode |
| **Day 3** | Bug fixes/support for frontend integration                                                                                                                                                               | Support Call UI integration, deployment config                                          | Integration with call component, polish chat UX                                                                                                                              | Extend to group calls (test with 5+ people — LiveKit needs no new code for this, just testing), call controls    | Finish screen share, cross-browser check, UI polish                                 |
| **Day 4** | Final bug fixes, deployment/hosting config                                                                                                                                                               | Final bug fixes                                                                         | Full end-to-end testing with multiple real users                                                                                                                             | Same, plus confirm LiveKit's automatic reconnect actually recovers a dropped connection                          | README, demo script/slides, rehearse presentation                                   |

This only works if the event/endpoint contract (`docs/EVENT_CONTRACT.md`) is locked on Day 1 morning, since backend and frontend build in parallel rather than backend-first. See Section 8 for how the shared package specifically enables this.

---

## 7. Challenges & Risks to Watch For

**1. First-time LiveKit SDK integration is the main unknown.**
Nobody on the team has used LiveKit before. The API itself is well-documented, but budget real time on Day 1-2 for the Call UI and Infra roles to get comfortable with `Room`, `LocalParticipant`, and token scoping before assuming it'll be quick. This replaces "group WebRTC mesh" as the top risk — same rank, different cause (learning curve vs. inherent fragility).

**2. LiveKit Cloud free-tier usage.**
The Build tier (5,000 WebRTC minutes/month, 100 concurrent connections) is comfortably enough for this project, but it's a hard cap — if it's hit, calls stop working until the next billing cycle with no way to buy more mid-project. Get the team in the habit of disconnecting/closing test calls instead of leaving them open in the background.

**3. The event/endpoint contract must be locked before parallel work starts.**
Since backend and frontend build simultaneously, any drift in event names/payloads between people causes integration bugs only caught late. Lock `docs/EVENT_CONTRACT.md` as a hard Day-1-morning deliverable — see Section 8 for why the shared package makes this enforceable rather than just a suggestion.

**4. Testing across real networks still matters, even with LiveKit.**
LiveKit handles NAT traversal for you, but network conditions (packet loss, low bandwidth) still affect call quality and reconnect behavior. Schedule an explicit cross-network test session on Day 2, not Day 4.

**5. Persistence + in-memory state overlap.**
Channels and messages are persisted (Supabase), but live presence and typing state are in-memory — make sure it's clear which parts of state survive a restart and which don't.

**7. The Supabase service-role key bypasses Row Level Security.**
Because there's no user auth, RLS is enabled with no public policies and `apps/api` connects with the service-role key. That key must never reach the Angular app or a committed `.env` — if it leaks, anyone can read and delete every room. Keep `.env` gitignored and make sure nobody pastes keys into a shared doc or screenshare.

**6. The call-token endpoint is a real access-control surface, even without user auth.**
Anyone who can call `POST /channels/:id/call-token` can join that channel's LiveKit room. Since there's no login system, the channel link/ID itself is the access control — make sure token minting doesn't leak channel IDs or allow enumerating them.

---

## 8. Monorepo Structure & Shared Contracts

The project is a **pnpm workspace monorepo** — one repo, two apps, one shared package:

```
lobby/
├── apps/
│   ├── api/                  # NestJS backend
│   └── web/                   # Angular frontend
├── packages/
│   └── shared/                 # Zod schemas + inferred types + socket event constants + mock fixtures
├── docs/
│   ├── ARCHITECTURE.md
│   └── EVENT_CONTRACT.md
├── CLAUDE.md                    # AI assistant guidelines/restrictions for this repo
├── README.md
├── eslint.config.js
├── .prettierrc.json
├── .husky/pre-commit
└── pnpm-workspace.yaml
```

**Why pnpm workspaces over Nx/Turborepo/Lerna:** for a 5-person team on a tight budget, plain pnpm workspaces give you the one thing that matters — `apps/api` and `apps/web` both importing a local `packages/shared` package without publishing to npm — with the least new tooling to learn.

**Shared contracts:** every payload that crosses the frontend/backend boundary (chat, typing, presence, the LiveKit call-token request/response) is defined **once** as a Zod schema in `packages/shared`, with the TypeScript type inferred from it. Both NestJS and Angular import and validate against the same schema — no hand-maintained duplicate types on either side.

**How this enables true parallel work:** `packages/shared/src/mocks/fixtures.ts` ships realistic, schema-valid sample data. Any frontend role can build and visually test their component against these fixtures before the real backend endpoint/event exists; any backend role can test their handler against the schema without a working UI. This is the mechanism that lets all five people genuinely start on Day 1 without waiting on each other — not just a folder-ownership convention.

Full details, data-flow diagram, and the reasoning behind Zod-over-class-validator are in **`docs/ARCHITECTURE.md`**.

## 9. Code Quality Tooling

- **ESLint** (`eslint.config.js`, flat config) — shared base rules for every workspace.
- **Prettier** (`.prettierrc.json`) — formatting only, decoupled from ESLint via `eslint-config-prettier`.
- **Husky + lint-staged** — a pre-commit hook runs ESLint (`--fix`) and Prettier on staged files automatically, so nobody has to remember to run these manually, and formatting bikeshedding in code review is a non-issue.
- **AI assistant behavior in this repo** is governed by `CLAUDE.md` — it's told to respect the shared contract, the tooling, and the per-role ownership boundaries the same way a human contributor should.

## 10. Event & Endpoint Contract

Lives in **`docs/EVENT_CONTRACT.md`**, next to the schemas it maps to (`packages/shared/src/schemas`), so it can't drift out of sync with the actual code. Lock it Day 1 morning.
