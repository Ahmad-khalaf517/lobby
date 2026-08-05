# Feature List

Full catalog of features under consideration for Lobby, grouped by area. This is a scope
reference, not a status tracker — for priority tiers, branch names, and ownership, see
`docs/PROJECT_PLAN.md` Section 2.

**Status legend:** ~~Struck-through~~ = verified working end-to-end (backend **and** frontend where
both apply) by reading the actual code in `apps/api` and `apps/web`, not by trusting
`PROJECT_PLAN.md`'s status column, which has drifted out of date in places. Unmarked = not
fully done — see **"Partially implemented / needs attention"** at the bottom for the specific gap
on anything that's built but incomplete, and file references.

_Last verified: 2026-08-05._

---

## Identity & Entry

- ~~Enter a display name to join as guest (no account needed)~~
- Guest session ID stored in a cookie
- ~~Register for an account~~
- ~~Log in~~
- ~~Forgot/reset password~~
- View and edit user profile (one identity — same name across all servers, no per-server nicknames)
- Manage account settings
- Adjust app settings (theme, notifications, etc.)

## Channels

- **Guest channels:** any guest (no account) can create a channel and invite others by sharing the
  link — temporary, auto-expires after a set time (e.g. 1 hour), and stands alone (not part of any
  server)
- **Authenticated channels:** channels created by logged-in users live inside a server, and can be
  permanent or expiring
- ~~Join a channel via link~~
- Rename/update a channel
- Delete a channel
- ~~Channels + full chat history persist across restarts (until expired/deleted)~~
- ~~Duplicate channel names are fine — no collision handling needed, IDs stay unique~~

## Chat

- ~~Real-time text messaging in a channel~~
- Typing indicator
- Message timestamps + grouping by sender
- Edit a message
- ~~Delete a message~~
- Message threads
- ~~Emoji reactions on messages~~
- Read state / unread badges

## Presence & Membership

- Member list — who's in the channel, with online/offline status visible
- Join/leave notifications
- Persistent room membership (rejoin permanent rooms any time)

## Voice & Video

- Create a voice channel; any member can start a call in it
- Other members see a "Join call" button + a short notification ping when a call starts (no
  ringtone)
- Reconnect handling
- Mute/unmute toggle
- Screen sharing

## Servers & Dashboard

- Dashboard (landing page after login) — shows the authenticated user's servers and permanent
  channels; guests don't have this, just their temporary channel(s)
- Create server
- Switch server
- Server icon / branding
- Server welcome screen
- Invite users to a server
- Server members list

## Social

- Friends list, friend requests, blocking
- Direct messages (DMs)

## UI/Platform

- Channel UI shell (chat + member list + call controls)
- ~~Copy-link button + toast~~
- ~~Responsive design~~
- Dark mode

## Security

- ~~Short-lived, per-channel LiveKit call tokens~~
- ~~Server-side-generated unguessable channel IDs~~
- ~~Service-role DB key never exposed to the browser~~

## Moderation

_(last, lowest priority)_

- Kick / ban / timeout members

---

## Partially implemented / needs attention

Nothing above is struck through unless it's confirmed working end-to-end. Several items are
**built but not actually usable** — either half-wired, backend-only, frontend-only, or silently
broken. Listed here so they don't get miscounted as either "done" or "not started."

### Real backend logic that no route ever calls (dead code)

`ServersService` has working methods that `ServersController` never exposes, so none of this is
reachable over HTTP even though it's implemented:

- `joinServer(inviteCode, userId)` — no `POST /servers/join` route. **"Invite users to a server"**
  has nothing on the receiving end.
- `leaveServer` / `listMembers` — no routes. **"Server members list"** and leaving a server are
  both unreachable.
- `createChannel` / `listChannels` (server-scoped) — no routes. Server-owned channels can be
  created directly in the repository layer but nothing in `ChannelsController` knows about
  `server_id`, so **"Authenticated channels"** only half-exists.
- Same pattern in `channels`: `ChannelsRepository.deleteChannel` exists but `ChannelsController`
  has no `DELETE` route — **"Delete a channel"** is implemented and unreachable.

### Backend done, frontend missing (or vice versa)

- **Typing indicator** — backend emits/relays the `TYPING` socket event correctly; `apps/web`
  never listens to or emits it. `SOCKET_EVENTS.TYPING` is imported nowhere in the frontend.
- **Join/leave notifications** — backend emits `USER_JOINED`/`USER_LEFT`; frontend only consumes
  `MEMBER_LIST` to silently refresh the roster, no toast for either event.
- **Create server** — backend `POST /servers` works; there's no frontend UI to call it at all.
- **Guest channel creation** — backend `POST /channels` works (temp, auto-expiring, standalone,
  exactly as specced); there's no frontend "create a channel" form anywhere — the guest join page
  can only pick an _existing_ open channel or link-join one.
- **Message timestamps + grouping** — timestamps are real on both sides. Grouping by sender is not
  implemented on either side; every message renders its own avatar/name regardless of consecutive
  sender.

### Built but functionally incomplete

- **Member list w/ online/offline status** — the list itself renders (frontend) and the roster is
  correct (backend, in-memory per-socket). The "online/offline status visible" part specifically
  is missing: `ChatAvatarComponent` supports a status dot, but the member list never passes one.
- **Reconnect handling** — Socket.IO's default auto-reconnect works and the UI shows
  "Live"/"Reconnecting…", but there's no LiveKit-specific reconnect logic (because there's no
  LiveKit integration yet at all — see below), no backoff UI, no manual retry.
- **Message threads** — only a lightweight quote-reply convention exists (prepends
  "↪ Reply to X: …" as plain text), not real threading.
- **Dark mode** — the whole app is a single hardcoded dark theme via CSS variables; there is no
  toggle and no light-mode variant, so this isn't really a "mode" yet, just the only theme.
- **Channel UI shell** — chat + member list are real and combined in one layout; the "call
  controls" part of the shell is decorative (see Voice & Video below), so the shell isn't fully
  functional yet.

### Voice & Video — essentially all still open

None of this is struck through, and it's worth being explicit about why, since the call-token
backend work is real:

- The LiveKit call-token endpoint (`POST /channels/:channelId/call-token`) mints a real, correctly
  scoped 10-minute token — but it authorizes **microphone only**
  (`canPublishSources: [TrackSource.MICROPHONE]`), not `TrackSource.SCREEN_SHARE`. Screen sharing
  would be rejected server-side even once the frontend exists.
- It also never checks that `channelId` refers to a real, non-expired channel — any string mints a
  working token.
- `livekit-client` isn't installed in `apps/web`, and there's zero LiveKit code anywhere in the
  frontend. The "Meet now" call button in the room UI has no click handler — it's decorative.
- There's no "voice channel" as a distinct concept (any channel can have a call started in it via
  the token endpoint), and no "join call" notification ping event exists in the gateway.
- Mute/unmute and screen-share UI don't exist even as stubs (`CallIconComponent` has no
  screen-share variant, and its mic-mute variant is never instantiated).

### Housekeeping / drift noticed during this audit (not scope gaps, just inconsistencies)

- `packages/shared/src/constants/socket-events.ts` is stale — the gateway already uses
  `MESSAGE_REACTION` and `DELETE_MESSAGE`/`MESSAGE_DELETED` at runtime, but neither is declared in
  that constants file, which is supposed to be the single source of truth per `CLAUDE.md`.
- `AuthModule`'s `SupabaseAuthGuard` exists and works but is currently only applied to a
  `TestController` — none of the real routes (`channels`, `servers`, `calls`) are guarded by it
  yet, which is expected for the guest flow but worth knowing if/when the account-system routes
  need to start requiring a real session.
- `apps/web`'s `environment*.ts` files still define `supabaseUrl`/`supabasePublishableKey` values
  that nothing in the app reads (`environment.apiUrl` is the only one actually used). Confirmed
  `apps/web` does **not** import `@supabase/supabase-js` or call Supabase directly anywhere — the
  architecture rule in `CLAUDE.md` is being followed — but the dead config is worth deleting so it
  doesn't tempt someone into bypassing the API layer later.
- `user_profiles` and `account_settings` tables exist in `supabase/schema.sql`, and their request
  schemas exist in `packages/shared`, but there's no backend controller/service for either — pure
  scaffolding with nothing behind it yet.

---

## Relationship to current scope

Most of the above tracks the High/Medium/Low tiers already defined in `docs/PROJECT_PLAN.md`
Section 2. The following areas are **not yet represented in PROJECT_PLAN.md** and have no
priority, owner, or hour estimate assigned:

- Message threads
- Read state / unread badges
- Server icon / branding
- Server welcome screen
- Server members list
- Social: friends list, friend requests, blocking, DMs
- Moderation: kick / ban / timeout

Note also that `CLAUDE.md`'s "no authentication system" restriction is scoped to the current
no-auth guest flow; PROJECT_PLAN.md already flags that it needs an explicit update before any
account-system work (register/login/dashboard/servers) begins — and per this audit, real
register/login/forgot-password code already exists in both apps, ahead of that restriction being
formally updated. The Social and Moderation categories extend further still — they assume
authenticated, persistent user identities (friends, blocks, DMs, per-server moderation roles),
which is a larger step past today's link-join model and would need its own scoping pass before
estimation.
