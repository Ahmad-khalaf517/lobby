# Features

## Guest dashboard

- Supabase Anonymous Auth bootstrap and refresh-safe restoration.
- Create and join temporary channels by invite code.
- Registered users keep their authoritative profile display name; anonymous users choose a validated per-channel name.
- Persistent active membership, owner/member roles, and stable LiveKit identities.
- Realtime roster and chat backed by the `guest` schema.
- Replies, edits, soft deletes, emoji reactions, and optimistic send reconciliation.
- Explicit member leave and owner close behavior.
- Direct-link restoration after a hard refresh.

## Calls

- Membership-authorized, short-lived LiveKit tokens minted by NestJS.
- Audio-only microphone and screen sharing; camera publication is not granted.
- Active-speaker UI, remote audio attachment, mute, screen-share, disconnect, and autoplay-block feedback.

## Registered application

- Email/password registration and login through Supabase Auth.
- Email confirmation, session refresh, logout, and password recovery.
- Registered application/server modules remain behind NestJS boundaries.
- View and edit user profile; manage account settings (notifications, app preferences).

## Architecture constraints

- Guest data uses direct, user-scoped Supabase RLS reads, RPC mutations, and Realtime.
- The service-role key is server-only.
- Guest chat has no public NestJS CRUD endpoint or Socket.IO gateway.
- LiveKit media never passes through NestJS.

See `docs/FEATURE_DETAILS.md`, `docs/EVENT_CONTRACT.md`, and `docs/ARCHITECTURE.md`.
