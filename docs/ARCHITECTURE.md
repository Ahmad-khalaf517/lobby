# Architecture

## Monorepo layout

- `apps/api`: NestJS authentication, privileged operations, and LiveKit token minting.
- `apps/web`: Angular UI, user-scoped Supabase guest data, Realtime, and LiveKit media.
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

## Guest application data

```text
Angular GuestChannelStore
  |-- RLS SELECT ------------> guest tables
  |-- authenticated RPC -----> guest mutation functions
  `-- Realtime subscription < guest Postgres changes
```

`auth.uid()` is the database identity. RPCs resolve the caller's member row and do not accept a user ID, member ID, owner flag, or LiveKit identity. The store owns channel, membership, members, messages, replies, reactions, loading/error state, deduplication, and subscription cleanup.

Persisted membership and media presence are separate:

- Supabase membership describes who joined, left, was removed, owns the channel, and which display name is persisted.
- LiveKit presence describes who is currently connected to media, speaking, muted, or screen sharing.

## LiveKit

```text
Angular -- POST /livekit/token { channelId } --> NestJS
NestJS -- verifies cookie user + guest membership --> Supabase (service role)
NestJS -- restricted short-lived token --> Angular
Angular <---------------- audio/screen share ----------------> LiveKit Cloud
```

NestJS reads the authoritative `livekit_identity`, `display_name`, and `livekit_room_name`. Ordinary members receive join, subscribe, microphone, and screen-share grants only. Camera publishing and room-administrator privileges are not granted.

Remote audio tracks are attached in Angular. Active-speaker, mute, screen-share, reconnection, and participant connection state come from LiveKit events and are never written continuously to Supabase.

## Legacy isolation

The public-schema channel repository remains in source for possible non-guest migration work, but `ChannelsModule` is not registered and cannot serve the guest dashboard. The Socket.IO guest gateway and duplicated Angular socket chat service were removed. Guest data has one realtime path: Supabase Realtime.

## Security boundaries

- `SUPABASE_SERVICE_ROLE_KEY` and `LIVEKIT_API_SECRET` exist only in `apps/api`.
- Angular uses the public Supabase URL/key plus the current user's short-lived JWT.
- Direct browser writes are not granted; guest mutations use security-definer RPCs with `auth.uid()` checks.
- Realtime and direct reads are constrained by guest-schema RLS.
- LiveKit tokens require an active, unremoved membership and an active, unexpired channel.

## Validation

Run:

```bash
pnpm lint
pnpm --filter api exec tsc -p tsconfig.json --noEmit
pnpm build
```

When Docker is available, also run the app-specific build commands documented in `AGENTS.md`.
