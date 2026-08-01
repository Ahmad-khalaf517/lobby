# Lobby Project Plan (Updated — LiveKit version)

**Stack:** NestJS (backend) + Angular (frontend) | **Team size:** 5 (3 backend, 2 frontend) | **Auth:** None for guest (High-priority) features — name + channel link only; a Medium-priority account system (login/register/servers/dashboard) is planned on top of it — see Section 2 | **Budget:** 100 working hours total, ~5 hrs/day per person

> **Note on the account system:** adding real user accounts and persistent multi-server/channel ownership is a genuine architecture change, not just new UI — it touches the "no-auth" security model this whole plan (and `CLAUDE.md`) is built around. Ephemeral link-join channels stay exactly as they are; the Medium-priority tier in Section 2 adds a _second_, parallel path for authenticated users rather than replacing the first. `CLAUDE.md`'s "no authentication system" restriction will need an explicit update before anyone starts that work — flagging this so it doesn't get missed.

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

## 2. Feature List (grouped by priority, with status/branch/owner)

**Owner key** (see Section 5 for full responsibilities — 3 backend, 2 frontend):
`BE-1` Core Gateway & Channels · `BE-2` Infra & Calls (LiveKit) · `BE-3` Auth & Platform ·
`FE-1` Chat/Channel/Dashboard UI · `FE-2` Call & Screen Share UI

Branch naming: backend branches are `api-<feature>`, frontend branches are `web-<feature>` — per
feature below, not per person, so two people never fight over one branch name.

**Priority levels** (applied consistently — a feature's priority is about urgency, not just
whether it's a guest feature or an account feature; guest features span all three tiers below):

- 🔴 **High** — the guest-facing core (Must-have): create/join a channel by link, chat, typing,
  presence, voice, screen share, persistence. Build this first, this is the demo.
- 🟡 **Medium** — guest-facing polish that's not required to demo (Should-have), plus
  authentication (register/login) and the authenticated dashboard/server experience it unlocks
  (servers, permanent/expiring channels, invitations, room membership). Still all assigned —
  Medium doesn't mean unassigned, just "after High."
- ⚪ **Low** — guest-facing extras explicitly flagged "cut first if hours run short"
  (Nice-to-have) — still assigned, same as Medium — **plus** settings and account recovery, which
  **are intentionally unassigned below**: nobody should pick those specific rows up until High and
  Medium priority work is done, then assign an owner.

---

### 🔴 High priority — Guest features, Must-have (MVP — required to demo)

| Feature                                                               | Layer    | Status                                                                              | Branch                   | Owner       |
| --------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- | ------------------------ | ----------- |
| Enter display name (no auth)                                          | Frontend | ❌ Not implemented                                                                  | `web-name-entry`         | FE-1        |
| Create channel → shareable link/ID                                    | Backend  | ✅ Implemented                                                                      | `api-create-channel`     | BE-1        |
|                                                                       | Frontend | ❌ Not implemented                                                                  | `web-create-channel`     | FE-1        |
| Join channel via link                                                 | Backend  | ✅ Implemented                                                                      | `api-join-channel`       | BE-1        |
|                                                                       | Frontend | ❌ Not implemented                                                                  | `web-join-channel`       | FE-1        |
| Real-time text chat scoped to the channel                             | Backend  | ✅ Implemented                                                                      | `api-chat-messages`      | BE-1        |
|                                                                       | Frontend | ❌ Not implemented                                                                  | `web-chat-ui`            | FE-1        |
| Typing indicator ("X is typing…")                                     | Backend  | ✅ Implemented                                                                      | `api-typing-indicator`   | BE-1        |
|                                                                       | Frontend | ❌ Not implemented                                                                  | `web-typing-indicator`   | FE-1        |
| Message timestamps / grouping by sender                               | Backend  | ✅ Implemented (every message carries a real `createdAt`)                           | `api-message-timestamps` | BE-1        |
|                                                                       | Frontend | ❌ Not implemented (display/grouping logic)                                         | `web-message-grouping`   | FE-1        |
| Member list (who's in the channel)                                    | Backend  | ✅ Implemented                                                                      | `api-member-list`        | BE-1        |
|                                                                       | Frontend | ❌ Not implemented                                                                  | `web-member-list-ui`     | FE-1        |
| Join/leave notifications ("X joined"/"X left")                        | Backend  | ✅ Implemented                                                                      | `api-presence-events`    | BE-1        |
|                                                                       | Frontend | ❌ Not implemented (toast UI)                                                       | `web-join-leave-toasts`  | FE-1        |
| Voice call via LiveKit (audio only, soft cap 8)                       | Backend  | ❌ Not implemented — no call-token endpoint yet, `livekit-server-sdk` not installed | `api-call-token`         | BE-2        |
|                                                                       | Frontend | ❌ Not implemented                                                                  | `web-call-ui`            | FE-2        |
| Screen sharing (LiveKit track publish)                                | Frontend | ❌ Not implemented                                                                  | `web-screen-share`       | FE-2        |
| Reconnect handling (LiveKit client SDK)                               | Frontend | ❌ Not implemented                                                                  | `web-call-reconnect`     | FE-2        |
| Basic UI shell (channel view, chat panel, member list, call controls) | Frontend | ❌ Not implemented                                                                  | `web-channel-shell-ui`   | FE-1 + FE-2 |
| Persist channels **and full chat history** in Supabase                | Backend  | ✅ Implemented                                                                      | `api-persistence`        | BE-1        |

---

### 🟡 Medium priority — Guest polish (Should-have)

| Feature                  | Layer    | Status             | Branch                  | Owner       |
| ------------------------ | -------- | ------------------ | ----------------------- | ----------- |
| Mute/unmute toggle       | Frontend | ❌ Not implemented | `web-mute-toggle`       | FE-2        |
| Copy-link button + toast | Frontend | ❌ Not implemented | `web-copy-link`         | FE-1        |
| Basic responsive design  | Frontend | ❌ Not implemented | `web-responsive-design` | FE-1 + FE-2 |
| Dark mode                | Frontend | ❌ Not implemented | `web-dark-mode`         | FE-1        |

### 🟡 Medium priority — Authentication & Dashboard/Servers

Adds an _optional_ authenticated path alongside the existing no-auth link-join flow — see the note
at the top of this document. Every room a server owns (permanent or expiring) still gets the same
chat + voice + screen-share stack as an ephemeral channel; nothing here replaces that, it's a second
way to _reach_ a channel (through a server you belong to, instead of a raw link).

| Feature                                                                                         | Layer    | Status                                                                                           | Branch                     | Owner |
| ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ | -------------------------- | ----- |
| Register                                                                                        | Backend  | ❌ Not implemented                                                                               | `api-auth-register`        | BE-3  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-auth-register`        | FE-1  |
| Login                                                                                           | Backend  | ❌ Not implemented                                                                               | `api-auth-login`           | BE-3  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-auth-login`           | FE-1  |
| Dashboard (authenticated landing page)                                                          | Backend  | ❌ Not implemented                                                                               | `api-dashboard`            | BE-3  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-dashboard`            | FE-1  |
| Create server                                                                                   | Backend  | ❌ Not implemented                                                                               | `api-create-server`        | BE-3  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-create-server`        | FE-1  |
| Switch server                                                                                   | Backend  | ❌ Not implemented                                                                               | `api-switch-server`        | BE-3  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-switch-server-ui`     | FE-1  |
| Create permanent channel (belongs to a server)                                                  | Backend  | ❌ Not implemented                                                                               | `api-permanent-channels`   | BE-1  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-permanent-channel-ui` | FE-1  |
| Create expiring channel (server-scoped; existing TTL logic already supports this)               | Backend  | ❌ Not implemented                                                                               | `api-expiring-channels`    | BE-1  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-expiring-channel-ui`  | FE-1  |
| Update channel (rename, etc.)                                                                   | Backend  | ❌ Not implemented                                                                               | `api-update-channel`       | BE-1  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-update-channel-ui`    | FE-1  |
| Remove channel                                                                                  | Backend  | ⚠️ Partially implemented (`ChannelsRepository.deleteChannel` exists; no REST route calls it yet) | `api-delete-channel`       | BE-1  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-delete-channel-ui`    | FE-1  |
| Send invitation to a server/room                                                                | Backend  | ❌ Not implemented                                                                               | `api-invitations`          | BE-3  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-invitations-ui`       | FE-1  |
| Persistent room membership (invited users can see/join a permanent room any time, like Discord) | Backend  | ❌ Not implemented                                                                               | `api-room-membership`      | BE-3  |
|                                                                                                 | Frontend | ❌ Not implemented                                                                               | `web-room-list-ui`         | FE-1  |

Backend note for whoever picks up this tier: follow the same contract-first process as the MVP
(Section 8) — add schemas to `packages/shared/src/schemas`, add REST rows to
`docs/EVENT_CONTRACT.md`, _then_ implement. This will need new Supabase tables (`users`, `servers`,
`server_members`, `invitations`, plus a nullable `server_id` on `channels`) — schema design isn't
done yet, that's part of `api-dashboard`/`api-create-server`.

---

### ⚪ Low priority — Guest polish (Nice-to-have, cut first if hours run short)

Still assigned (BE-1/FE-1) — "low priority" here just means "do this last," not "unassigned."

| Feature                         | Layer    | Status             | Branch                        | Owner |
| ------------------------------- | -------- | ------------------ | ----------------------------- | ----- |
| Channel name collision handling | Backend  | ❌ Not implemented | `api-name-collision-handling` | BE-1  |
|                                 | Frontend | ❌ Not implemented | `web-name-collision-ui`       | FE-1  |
| Emoji reactions                 | Backend  | ❌ Not implemented | `api-emoji-reactions`         | BE-1  |
|                                 | Frontend | ❌ Not implemented | `web-emoji-reactions`         | FE-1  |

### ⚪ Low priority — Settings & account recovery

**Deliberately unassigned** — unlike the row above, don't put anyone's name on these until High
and Medium priority work is done — whoever's free first picks these up then.

| Feature                                               | Layer    | Status             | Branch                     | Owner        |
| ----------------------------------------------------- | -------- | ------------------ | -------------------------- | ------------ |
| Forgot password                                       | Backend  | ❌ Not implemented | `api-auth-forgot-password` | _Unassigned_ |
|                                                       | Frontend | ❌ Not implemented | `web-auth-forgot-password` | _Unassigned_ |
| User profile (view/edit)                              | Backend  | ❌ Not implemented | `api-user-profile`         | _Unassigned_ |
|                                                       | Frontend | ❌ Not implemented | `web-user-profile`         | _Unassigned_ |
| Account settings                                      | Backend  | ❌ Not implemented | `api-account-settings`     | _Unassigned_ |
|                                                       | Frontend | ❌ Not implemented | `web-account-settings`     | _Unassigned_ |
| Application settings (theme/notification prefs, etc.) | Frontend | ❌ Not implemented | `web-app-settings`         | _Unassigned_ |

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

## 5. Team Split & Hour Budget (5 people: 3 backend, 2 frontend)

Updated from the original 2-backend/3-frontend split to 3 backend/2 frontend, and scope now
includes Section 2's Phase 2 (auth/servers/dashboard). That's real new backend surface area with
one fewer frontend person covering the same MVP UI ground — the **100-hour MVP budget below has
not been re-estimated for the extra frontend load**; treat it as a placeholder until FE-1/FE-2
size their own work, and expect Phase 2 (whole extra column, not in this budget) to need its own
separate hour estimate before anyone commits to a timeline for it.

| Role                                    | Responsibilities                                                                                                                                                                                                                                 | MVP Hours                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **BE-1 — Core Gateway & Channels**      | NestJS Socket.IO gateway: create/join channel, chat + typing events, presence, member list, persistence; owns channel CRUD for Phase 2 too (permanent/expiring/update/delete)                                                                    | ~17                                                        |
| **BE-2 — Infra & Calls**                | LiveKit call-token REST endpoint (`livekit-server-sdk`), LiveKit Cloud project setup, deployment/hosting config                                                                                                                                  | ~11                                                        |
| **BE-3 — Auth & Platform** _(new role)_ | Phase 2 only: auth (register/login/forgot-password), user profile/account settings, servers, dashboard, invitations, room membership                                                                                                             | Phase 2 — not yet estimated                                |
| **FE-1 — Chat, Channel & Dashboard UI** | Name entry, create/join flow, chat UI, typing indicator, message grouping/timestamps, member list, join/leave toasts, copy-link, dark mode; Phase 2: auth UI, profile/settings, dashboard, server switch/create, channel management, invitations | ~19 (MVP) + Phase 2                                        |
| **FE-2 — Call & Screen Share UI**       | LiveKit `Room` integration (connect, publish/subscribe audio), call controls (mute, leave), screen share, reconnect handling — reconnect itself is the SDK's job, not hand-built                                                                 | ~15 + ~18 (absorbed from the old Screen Share/Polish role) |

**MVP total allocated: ~62 hours** across BE-1/BE-2/FE-1/FE-2 as scoped above, **not counting**
FE-2 absorbing the old "Screen Share & Polish" role's remaining work (responsive design, dark mode
polish, demo prep) or BE-3's Phase 2 hours — both still need real estimates before the schedule in
Section 6 (which still describes the _old_ 5-role split) can be trusted as-is. Re-baseline Section 6
once BE-3 and the FE-1/FE-2 consolidation have hour estimates.

BE-1 and BE-2 should sync closely (same NestJS app, different modules) — BE-3 too, once Phase 2
starts, since all three land in `apps/api`. FE-1 and FE-2 share the channel component shell.

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

**6. The Supabase service-role key bypasses Row Level Security.**
Because there's no user auth, RLS is enabled with no public policies and `apps/api` connects with the service-role key. That key must never reach the Angular app or a committed `.env` — if it leaks, anyone can read and delete every room. Keep `.env` gitignored and make sure nobody pastes keys into a shared doc or screenshare.

**7. The call-token endpoint is a real access-control surface, even without user auth.**
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
│   ├── EVENT_CONTRACT.md
│   ├── PROJECT_PLAN.md
│   └── AI_AGENT_GUIDE.md
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
