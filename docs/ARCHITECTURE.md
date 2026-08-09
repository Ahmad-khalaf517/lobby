# Architecture

## Monorepo layout

- `apps/api`: NestJS authentication, privileged operations, and LiveKit token minting.
- `apps/web`: Angular UI, user-scoped Supabase guest/authenticated chat data, Realtime, and LiveKit media.
- `packages/shared`: Zod schemas and shared limits for Angular/NestJS boundaries.
- `apps/api/supabase`: guest schema migrations, RLS, RPC functions, Realtime publication, and cleanup jobs.

## Guest session flow

```text
Angular -> NestJS /auth/me or /auth/refresh
        <- short-lived access token + user type
Angular memory -> Supabase client REST/RPC + Realtime authentication
HttpOnly cookie -> NestJS only -> Supabase refresh session
```

Registered and anonymous users share the same Supabase Auth session model. Angular never stores access or refresh tokens in local storage. NestJS creates an anonymous account only when no valid or refreshable session exists.

Angular assigns every authenticated account a session revision. Logout or an account-id change invalidates that revision before clearing dashboard, friend, DM, profile, notification, selection, and LiveKit state. Async responses may commit only while their captured revision is current. A same-account token refresh preserves the revision and cached state.

## Guest application data

```text
Angular GuestChannelStore
  |-- RLS SELECT ------------> guest tables
  |-- authenticated RPC -----> guest mutation functions
  |-- registered create -----> NestJS -> user-scoped guest.create_channel RPC
  `-- Realtime subscription < guest Postgres changes
```

`auth.uid()` is the database identity. RPCs resolve the caller's member row and do not accept a user ID, member ID, owner flag, or LiveKit identity. The store owns channel, membership, members, messages, replies, reactions, loading/error state, deduplication, and subscription cleanup.

Persisted membership and media presence are separate:

- Supabase membership describes who joined, left, was removed, owns the channel, and which display name is persisted.
- LiveKit presence describes who is currently connected to media, speaking, muted, or screen sharing.

## Authenticated server-channel chat

```text
Angular authenticated channel UI / RoomChatComponent
  -> ChannelChatStore
  |-- RLS SELECT ------------> public.messages + public.message_reactions
  |-- authenticated RPC -----> public chat mutation functions
  `-- Realtime subscription < public Postgres changes
```

`ChannelChatStore` is independent of `GuestChannelStore` and of the current dashboard presentation. `RoomChatComponent` remains presentational: it receives mapped `ChatMessage` values and emits user intents, but contains no authenticated persistence or membership logic. An authenticated-only adapter currently connects the store to that component so the dashboard chat can be redesigned later without replacing the chat data layer.

The browser keeps raw table mutations revoked. Narrow security-definer RPCs are the authenticated chat write authority: each rejects anonymous sessions, derives identity from `auth.uid()`, verifies `server_members` plus active `channel_members`, and accepts no browser-supplied user/member/role value. A lazy `channel_members` row supplies normalized sender/reaction identity only after server membership has been authorized. Message retries are idempotent through a browser-generated client UUID. Edits and deletes are sender-only; deletes are soft updates so Realtime does not depend on deleted-row payload visibility.

The browser receives RLS-filtered history and Realtime rows from `public.messages` and `public.message_reactions`. RLS calls a security-definer membership predicate without granting direct reads on `channels` or `server_members`. The store filters one subscription to the active channel, merges raw events with optimistic rows, guards every async commit with the account revision plus a channel revision, and removes the subscription on navigation, logout, or account change.

## LiveKit

```text
Angular -- POST /livekit/token { channelId } --> NestJS
NestJS -- verifies cookie user + guest membership --> Supabase (service role)
NestJS -- restricted short-lived token --> Angular
Angular <---------------- audio/screen share ----------------> LiveKit Cloud
```

Authenticated server channels use parallel registered-only REST routes:

```text
Angular -- POST /server-channels/:channelId/call-token --> NestJS
NestJS -- RegisteredUserGuard + server/channel membership --> public schema
NestJS -- derives server-channel room + member identity --> LiveKit token
Angular <---------------- audio/screen share ----------------> LiveKit Cloud
```

NestJS reads the authoritative `livekit_identity`, `display_name`, and `livekit_room_name`. Ordinary members receive join, subscribe, microphone, and screen-share grants only. Camera publishing and room-administrator privileges are not granted.

For authenticated channels, NestJS derives the room name from the validated channel UUID and derives the LiveKit participant identity from the normalized `channel_members` row. The Angular dashboard reuses the same `LiveKitCallService` and shared call-stage/control/participant components as Guest Dashboard. A user-scoped session marker restores an interrupted page refresh with a fresh token; account transition cleanup removes that marker and disconnects LiveKit before stale work can reattach. The rail keeps explicit mute/leave controls available while navigating between server channels.

`guest.channels.max_call_participants` is independent of the guest-channel membership limit. NestJS explicitly creates each LiveKit room with this stored value before issuing a token. LiveKit is the final capacity enforcement layer; the token endpoint's participant check and Angular's status display are user-experience safeguards only. Registered creators may configure a capacity up to 50 and a lifetime up to three hours through the guarded NestJS creation endpoint. Anonymous creators keep the database defaults.

Remote audio tracks are attached in Angular. Active-speaker, mute, screen-share, reconnection, and participant connection state come from LiveKit events and are never written continuously to Supabase.

The shared call service disables a new share while a remote participant is presenting. If two participants start in the same instant, all clients select the same identity deterministically and the losing local publisher stops its screen track, restoring the single-presenter state without application media signaling.

Owner kick/block actions remain authenticated guest-schema RPCs. Their membership update is distributed through Supabase Realtime. After the database commits the removal, Angular asks the guarded NestJS LiveKit endpoint to disconnect that already-removed media identity and revoke its current token; NestJS independently verifies the owner and removal record first.

## Legacy isolation

The public-schema channel repository remains in source for possible non-guest migration work, but `ChannelsModule` is not registered and cannot serve the guest dashboard. The Socket.IO guest gateway and duplicated Angular socket chat service were removed. Guest data has one realtime path: Supabase Realtime.

## Security boundaries

- `SUPABASE_SERVICE_ROLE_KEY` and `LIVEKIT_API_SECRET` exist only in `apps/api`.
- Angular uses the public Supabase URL/key plus the current user's short-lived JWT.
- Registered-dashboard controllers stack `RegisteredUserGuard` after cookie authentication; guest call and guest-channel endpoints intentionally continue accepting anonymous sessions.
- Unsafe requests carrying auth cookies require an `Origin` or `Referer` whose origin is in the configured CORS allowlist.
- Password recovery has a short-lived HttpOnly proof issued only after recovery-token verification. Signed-in password changes use a separate endpoint and verify the current password.
- Profile rows are provisioned after successful registered authentication. Profile GET is read-only and returns 404 when a row is missing.
- Direct browser table writes are not granted; guest and authenticated-chat mutations use narrow security-definer RPCs with `auth.uid()` checks.
- Realtime and direct reads are constrained by schema-specific membership RLS.
- Guest LiveKit tokens require an active, unremoved membership and an active, unexpired guest channel. Authenticated server-channel tokens require a registered account, current server membership, and active channel access.

## Validation

Run:

```bash
pnpm lint
pnpm --filter api exec tsc -p tsconfig.json --noEmit
pnpm build
```

When Docker is available, also run the app-specific build commands documented in `AGENTS.md`.
