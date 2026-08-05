# Feature Details

Expanded spec for every item in `docs/FEATURES.md` — what each feature actually means, the data/
events it needs, and open design questions. `docs/FEATURES.md` stays the scannable checklist;
this is where the "what exactly does 'X' involve" answer lives.

Conventions referenced throughout (see `CLAUDE.md`): every payload crossing the frontend/backend
boundary is a Zod schema in `packages/shared`; every socket event name lives in
`packages/shared/src/constants/socket-events.ts`; Supabase rows are snake_case and get mapped to
camelCase in a feature-local `*.mappers.ts`, never returned raw.

---

## Identity & Entry

### Enter a display name to join as guest

No account, no password — a display name is the entire guest identity, scoped to one channel at a
time. Flow: user opens a channel link → `guest-room-page` shows a name-entry form (or skips it if
`?name=` is already in the URL) → on submit, the client connects a Socket.IO connection and emits
`JOIN_CHANNEL` with `{ channelId, name }` → the gateway opens (or reactivates) a
`channel_members` row and returns the roster. Name is validated against `MAX_NAME_LENGTH` (40
chars) client- and server-side via `JoinChannelPayloadSchema`. Nothing about this identity
persists beyond the socket connection today — that's the next item.

### Guest session ID stored in a cookie

Not yet built. Purpose: let a guest refresh the page or briefly lose connection without retyping
their name or losing "ownership" of their `channel_members` row (today, a refresh just opens a
_new_ member row unless the name happens to match — see the `unique_channel_guest` index in
`supabase/schema.sql`, which reactivates a row on exact-name rejoin, but that's a name collision
mechanic, not a session mechanic). Suggested shape: a non-httpOnly cookie (it holds no secret,
just a client-generated guest ID + display name pair), scoped per channel, read by the frontend on
load to skip the name form and passed to `JOIN_CHANNEL` so the gateway can match it against the
existing `channel_members.id` instead of creating a new row. Doesn't need a backend endpoint —
this is a client-side concern that changes what `JOIN_CHANNEL`'s payload optionally includes.

### Register / Log in

Backed by Supabase Auth (GoTrue) directly — there's no custom `users`-with-password table.
`AuthService` wraps `signUp`/`signInWithPassword`; on success, `apps/api` sets `access_token` and
`refresh_token` as httpOnly cookies (`auth-cookies.ts`) so the Angular app never touches a raw JWT.
`POST /auth/refresh` rotates the session; `POST /auth/logout` clears the cookies. This is fully
wired end-to-end (`AuthController`/`AuthService` in `apps/api`, `AuthService` + login/register
pages in `apps/web`) — see `docs/FEATURES.md` for the verified status.

### Forgot/reset password

Three-step OTP flow, all via Supabase: `POST /auth/forgot-password` (`resetPasswordForEmail`)
sends the email → the reset link lands on `reset-password-page`, which calls
`POST /auth/verify-recovery` (`verifyOtp`) on load to establish a temporary session → the user
sets a new password via `POST /auth/reset-password` (`setSession` + `updateUser`). Fully wired.

### View and edit user profile

Scaffolded, not implemented. `packages/shared/src/schemas/user-profile.schema.ts` and the
`user_profiles` table (`user_id`, `display_name`, `bio`, `avatar_url`, timestamps) already exist,
but no controller/service/repository reads or writes it, and no frontend page exists. One identity
per account — same display name/avatar everywhere, no per-server nickname override (that's a
deliberate simplification vs. Discord). Needs: `GET/PATCH /users/:userId/profile` in a new
`users` module, a mapper (`user_profiles` → `UserProfile`), and a profile page in `apps/web`.

### Manage account settings

Same situation as profile: `account_settings` table exists (`email_notifications_enabled`,
`push_notifications_enabled`), schema exists, nothing behind it. Scope is small — two booleans —
so this is mostly a thin CRUD pair plus a settings-page toggle UI.

### Adjust app settings (theme, notifications)

Distinct from _account_ settings above — this is local UI preference (dark/light, in-app
notification sound/toast on/off), not synced to the backend. No backend involvement needed; belongs
entirely in `apps/web` as a local-storage-or-cookie-backed preference. Currently the app has no
theme toggle at all (see Dark Mode under UI/Platform) and no notification-preference UI.

---

## Channels

### Guest channels

A guest (no account) can create a standalone channel — `server_id` is `null` — and share its link.
`POST /channels` already does this (`ChannelsRepository.createChannel`), generating an 8-char
`nanoid` ID and an `expires_at` timestamp. **Note a spec/implementation mismatch worth resolving:**
the feature list's example TTL is "e.g. 1 hour," but the current default is `ttlHours = 24`. Not a
bug — `createChannel(name, ttlHours = 24)` already accepts a custom TTL — but nobody has decided
the real default yet, and there's no frontend "create a channel" form at all yet to expose that
choice to a user.

### Authenticated channels

Channels owned by a server (`server_id` set), created by a logged-in member.
`ServersRepository.createChannelForServer` exists and inserts with `server_id` set, but has no TTL
parameter at all today — every server channel is implicitly permanent. If expiring server channels
are wanted (the feature list says "can be permanent or expiring"), that method needs an optional
`ttlHours` param mirroring the guest-channel one. Also currently unreachable: `ServersService`
wraps this correctly, but `ServersController` never exposes a route for it — see
`docs/FEATURES.md`'s dead-code section.

### Join a channel via link

No invite-code layer for channels — the channel ID _is_ the secret (per `CLAUDE.md`'s security
model: "do you know the channel id?"). `GET /channels/:id` fetches it, then `JOIN_CHANNEL` over the
socket opens membership. This is why channel IDs must stay unguessable (`nanoid(8)`, ~47 bits of
entropy) — see Security below.

### Rename/update a channel

Not implemented on either side. Needs a `PATCH /channels/:id` route + `ChannelsService.updateChannel`
(the pattern already exists for servers — `ServersController.update` / `assertOwner` is a direct
template to copy), plus deciding who's allowed to rename a _guest_ channel with no owner concept
(current best answer: whoever created it, which requires tracking a creator/owner on guest
channels — not modeled today).

### Delete a channel

Backend logic already exists (`ChannelsRepository.deleteChannel`) — cascades to `messages` via the
FK's `on delete cascade`. Just needs a controller route. Same ownership question as rename applies.

### Persistence

`channels` and `messages` are real Supabase tables, queried (not mocked) by `ChannelsRepository`.
Survives an `apps/api` restart by construction — nothing about persistence is in-memory except
live socket presence (see Presence & Membership).

### Duplicate channel names are fine

Enforced structurally, not by app logic: the `unique (server_id, name)` constraint in
`supabase/schema.sql` only blocks duplicates _within the same server_. Guest channels all have
`server_id = null`, and Postgres treats every `NULL` as distinct in a unique constraint, so two
guest channels can share a name with no collision handling needed — this was a deliberate schema
decision, not an oversight.

---

## Chat

### Real-time text messaging

`CHAT_MESSAGE` socket event → persisted to `messages` → broadcast to the room with the persisted
row (so every client, including the sender, renders from the same source of truth with a real
`id`/`createdAt`). Fully wired both sides.

### Typing indicator

Backend correctly relays `{ name, isTyping }` to the room and deliberately does **not** persist it
(ephemeral by nature). The gap is entirely frontend: `apps/web` never emits or listens to
`SOCKET_EVENTS.TYPING`. Per `CLAUDE.md`'s flagged risk area, whoever wires this up needs a
debounce/timeout strategy on emit — don't fire on every keystroke; a common pattern is: emit
`isTyping: true` on the first keystroke after an idle period, then a client-side timer (~2–3s of no
further input) emits `isTyping: false` automatically, so the indicator doesn't spam the socket or
get stuck on.

### Message timestamps + grouping by sender

Timestamps are real (`createdAt` from the DB) on both sides already. "Grouping" — collapsing
consecutive messages from the same sender into one avatar/name block, Discord/Slack-style — has no
logic anywhere yet. This is a pure frontend concern (compare each message's `senderId` and
`createdAt` against the previous one, typically also capping the group by a time gap, e.g. "same
sender within 5 minutes") — no backend change needed.

### Edit a message

Not implemented. The `messages.edited_at` column already exists in the schema, unused. Needs: a
new `EDIT_MESSAGE` socket event (added to `socket-events.ts` first, per the golden rule in
`CLAUDE.md`), a gateway handler that updates `content` + sets `edited_at`, broadcasts the updated
row, and frontend edit-mode UI (`ChatMessageComponent` currently only exposes reply/react/delete
actions).

### Delete a message

Implemented and wired: `DELETE_MESSAGE` → row removed from `messages` → `MESSAGE_DELETED`
broadcast → frontend removes it from the list. Note: `SOCKET_EVENTS` in
`packages/shared/src/constants/socket-events.ts` doesn't actually declare
`DELETE_MESSAGE`/`MESSAGE_DELETED` even though the gateway uses them at runtime — that constants
file needs to catch up to match reality (see `docs/FEATURES.md`'s housekeeping notes).

### Message threads

What exists today is a text convention, not real threading: replying prepends
`"↪ Reply to X: …"` to a normal top-level message. A real implementation needs a schema change —
a nullable `parent_message_id` on `messages` — plus deciding the UX: inline collapsed replies
(like Slack) vs. a separate thread panel (like Discord). This is one of the larger unscoped
items — worth a dedicated design pass before estimating hours.

### Emoji reactions

Implemented: `MESSAGE_REACTION` toggles a row in `message_reactions` (insert if the user hadn't
reacted with that emoji, delete if they had — a toggle, not an add-only log), broadcasts the
updated aggregate. Notably resilient: `isReactionPersistenceUnavailable` in
`channels.repository.ts` lets the feature degrade gracefully if that table is ever missing rather
than hard-erroring the whole message flow.

### Read state / unread badges

Nothing exists — no column, table, or event. Needs a `last_read_message_id` (or
`last_read_at` timestamp) per `channel_members` row, an event to update it (fires when a user has
the channel open/scrolled to bottom — needs its own debounce so it's not firing on every message),
and a way to compute "unread count since last read" either lazily (client compares) or eagerly
(server includes it in the member-list/channel-list payload).

---

## Presence & Membership

### Member list with online/offline status

The roster itself is real — `channel.gateway.ts` keeps an in-memory `Map` of connected sockets per
channel and broadcasts `MEMBER_LIST` on join/leave/disconnect. What's missing is specifically the
"status visible" half: `ChatAvatarComponent` already supports an online/offline/muted status dot in
its API, but the member-list rendering never passes a status prop into it. Since presence here is
inherently live (in-memory, not a DB column), "status" is really just "is this member's socket
currently in the `MEMBER_LIST` payload" — wiring it through is a frontend-only fix once someone
maps `MEMBER_LIST` entries to the avatar's status input.

### Join/leave notifications

Backend emits `USER_JOINED`/`USER_LEFT` correctly on every join, leave, and disconnect. Frontend
only consumes `MEMBER_LIST` to quietly refresh the roster — no toast fires for either event today.
The existing message-toast pattern (`showToast()` in `guest-room-page.ts`) is a direct template to
reuse for this.

### Persistent room membership

This is what makes rejoining a _server-owned_ room possible without re-sharing a link — a
`server_members` row means "this user belongs here, always." The data model
(`ServersRepository.isMember`/`addMember`/`removeMember`) and the service logic
(`joinServer`/`leaveServer`/`assertMember`) are already correct; the only gap is that
`ServersController` never exposes `joinServer`/`leaveServer` as routes, so there's no way to
actually become a member today outside direct DB access. This is the same dead-code gap called out
under Servers & Dashboard below — one fix (adding the missing routes) resolves both.

---

## Voice & Video

### Create a voice channel; any member can start a call

There's no separate "voice channel" entity today — any existing text channel can have a call
started in it via `POST /channels/:channelId/call-token`, which just mints a token bound to
`channel-${channelId}`. Whether to formalize a distinct voice-channel type (a `type: 'text' |
'voice'` column, shown differently in the UI, maybe without a message list) or keep the current
"any channel, any time" model is an open product decision — the current backend already supports
the _simpler_ interpretation ("any member of any channel can start a call in it") with zero extra
work, so that's the pragmatic default unless there's a reason to distinguish channel types.

### "Join call" button + notification ping

Two different things bundled in one feature line, worth separating:

- **The button** is pure frontend state: has anyone in this channel currently got an active
  LiveKit room open? (LiveKit's `RoomServiceClient.listRooms`/`listParticipants` can answer that,
  or the frontend can infer it from whoever's already connected.)
- **The ping** ("X started a call") is a lightweight _announcement_, not a call-join action —
  important distinction, because `CLAUDE.md` and `call.schema.ts` are explicit that there is no
  socket event for _joining_ a call (that stays REST + LiveKit-only, `apps/api` never touches
  media). An announcement is different: it could go out over the existing Socket.IO gateway (e.g.
  a `CALL_STARTED` event, chat-layer, informational only — added to `socket-events.ts` first) fired
  the moment someone successfully mints a call token, without violating the "no call signaling
  over Socket.IO" rule, since it carries no join/media semantics. Worth confirming this
  interpretation before building it, since it's a new event type this doc is proposing, not one
  that exists yet.

### Reconnect handling

Two independent reconnect concerns, only one of which exists: Socket.IO's default auto-reconnect
already recovers the _chat_ connection (visible today as the "Live"/"Reconnecting…" indicator).
LiveKit's client SDK has its own, separate auto-reconnect for the _call_ connection — since there's
no LiveKit integration in the frontend at all yet, that half doesn't exist. Once `livekit-client`
is wired up, its `Room` object handles reconnect internally (per `CLAUDE.md`: "reconnect itself is
the SDK's job, not hand-built") — the frontend work is surfacing connection-quality state in the UI,
not writing reconnect logic.

### Mute/unmute toggle

Purely a local media-track operation once LiveKit is integrated — `LocalParticipant.setMicrophoneEnabled(false)`
or equivalent — no backend involvement. `CallIconComponent` already has a `mic` variant in its
props/docs; it's just never instantiated with a click handler yet.

### Screen sharing

Two separate blockers, one on each side: (1) the LiveKit token today only grants
`canPublishSources: [TrackSource.MICROPHONE]` — screen-share publish attempts would be rejected
server-side until `TrackSource.SCREEN_SHARE` (and likely `SCREEN_SHARE_AUDIO`, for shared-tab audio)
is added to that grant in `calls.service.ts`; (2) there's no screen-share UI at all yet —
`CallIconType` doesn't even have a screen-share variant defined. Explicitly **not** camera/video —
`CLAUDE.md` bans camera tracks by design; screen share is the one video-shaped exception.

---

## Servers & Dashboard

### Dashboard

The authenticated landing page after login — meant to show a user's servers plus their permanent
channels in one view. `lobby-page` is currently a literal placeholder stub. No backend aggregation
endpoint exists either; the closest today is `GET /servers?userId=`, which returns servers only,
not channels within them. A real dashboard endpoint would likely join servers → their channels in
one payload so the frontend isn't making N+1 requests to render the sidebar.

### Create server / Switch server

Creation is done backend-side (`POST /servers`); there's no frontend form to call it. "Switch
server" is purely a frontend routing/state concern (which server's channels are currently shown) —
no backend work needed beyond what `GET /servers/:id` already returns.

### Server icon / branding, Server welcome screen

Neither has any backing data today — the `servers` table has no icon/color/description columns.
Would need schema additions (e.g. `icon_url`, `description`/`welcome_message`) plus, for the icon
specifically, a decision on image hosting (Supabase Storage is the natural fit given the project's
already-adopted Supabase dependency, and keeps everything in one hosted service rather than adding
a new one).

### Invite users to a server

The server-side logic already exists and already works: `ServersRepository.findServerByInviteCode`

- `addMember`, wrapped by `ServersService.joinServer`. It's genuinely just missing a controller
  route (`POST /servers/join` with `{ inviteCode }`, validated by the already-defined
  `JoinServerRequestSchema`) — this is close to a five-minute fix, not a design problem.

### Server members list

Same story: `ServersRepository.listMembers` and `ServersService.listMembers` work; needs a
`GET /servers/:id/members` route and a frontend list component (can likely reuse most of the
existing channel member-list UI/patterns).

---

## Social

Bigger scope jump than everything else on this list — it assumes a persistent, authenticated
social graph, which nothing else in the app currently has (guests have no persistent identity at
all, and even authenticated users today only relate to each other via shared server membership).
Needs its own scoping/estimation pass before anyone commits hours to it; details below are a
starting sketch, not a locked spec.

### Friends list, friend requests, blocking

Needs new tables — most naturally a single `friendships` table with a `status` enum
(`pending`/`accepted`/`blocked`) and `requester_id`/`addressee_id`, rather than three separate
tables, so a friendship's whole lifecycle (request → accept/decline → possible later block) lives
in one row. Blocking needs to actually _do_ something once it exists: at minimum, hide DMs from the
blocker, hide the blocker's online status from the blocked user, and reject new server
invites/friend requests from a blocked user — worth deciding the exact enforcement list up front
rather than adding a `blocked` status with no enforced behavior.

### Direct messages (DMs)

Structurally close to a channel with no server and no open link-join — a private 1:1 (or later,
group) room whose membership is exactly two (or N) specific `user_id`s, not "whoever has the
link." Could reuse the existing `channels`/`messages` tables with a new `is_dm` flag and a
`dm_participants` join table, rather than a fully parallel messaging system — keeps message
storage, reactions, and delete/edit logic (once built) shared instead of duplicated. Requires
friends/blocking to exist first if DMs are meant to be gated by friendship status, which is the
more common product pattern (vs. allowing any authenticated user to DM any other).

---

## UI/Platform

### Channel UI shell

The chat + member-list combination is real and already one integrated layout
(`guest-room-page.html`). The "call controls" part of the shell exists visually (a "Meet now"
button) but isn't functional yet — see Voice & Video. Once LiveKit is wired up, the controls slot
into this same layout rather than needing a new shell.

### Copy-link button + toast

Done — `navigator.clipboard.writeText` + a temporary "Copied" state on the button label. No further
work needed here.

### Responsive design

Done — Tailwind responsive breakpoints (`sm:`/`md:`/`lg:`) are used throughout the built pages.

### Dark mode

What exists is a single hardcoded dark theme (CSS custom properties in `styles.css`) — there's no
light-mode variant and no toggle, so calling it "dark mode" is slightly generous; it's currently
just "the app's only theme, which happens to be dark." A real dark-mode feature needs a light
palette defined alongside it and a toggle (persisted via the app-settings preference described
under Identity & Entry) that flips a class/attribute the CSS variables key off.

---

## Security

### Short-lived, per-channel LiveKit call tokens

Done — 10-minute TTL, scoped to `channel-${channelId}`, minted server-side only. Two related gaps
tracked under Voice & Video (missing screen-share grant, no channel-existence check) don't affect
the token's _lifetime/scoping_ correctness, just what it authorizes and when it's issued.

### Server-side-generated unguessable channel IDs

Done — `nanoid(8)` for channel IDs, a separate `nanoid()` (21-char) for LiveKit participant
identities, and `customAlphabet` for server invite codes. All generated server-side; none are
predictable or sequential.

### Service-role DB key never exposed to the browser

Done and verified — the service-role key is read only in `apps/api`'s `SupabaseService`, and
`apps/web` neither imports `@supabase/supabase-js` nor references any Supabase env var that's
actually used (its `environment.ts` files have stale, unused `supabaseUrl`/`supabasePublishableKey`
fields worth deleting — see `docs/FEATURES.md` housekeeping notes — but nothing reads them).

---

## Moderation

### Kick / ban / timeout members

Lowest priority by design, and currently has no groundwork at all beyond a role column.
`server_members.role` already distinguishes `owner`/`member`, but there's no `moderator` role, no
ban list, and no timeout/mute-until timestamp anywhere in the schema. Interesting pre-existing
detail: `database.types.ts` defines a `guest_room_end_reason` enum that already includes a
`'moderation'` value, but nothing in `apps/api` ever sets or reads it — a hint that moderation was
anticipated at some point but never scoped. A minimal version would need: a `banned_users` table
(or a `banned_until`/`is_banned` pair on `server_members`), an owner/moderator-only kick endpoint
(remove the `server_members` row + force-disconnect any active socket for that user in that
channel), and equivalent enforcement in the guest-channel case, where there's no persistent
membership row to delete at all — kicking a guest would need to be a purely socket-layer
"disconnect and blocklist this identity for N minutes" action instead.
