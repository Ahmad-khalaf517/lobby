# Creating and Using a Guest Channel

Guest channels use Supabase Anonymous Auth, the `guest` schema, database RPCs, Row Level Security, and filtered Realtime subscriptions. The Angular client never uses the Supabase service-role key, and NestJS is not in the guest chat data path.

See `docs/EVENT_CONTRACT.md` for the exact RPC and REST contracts and `docs/ARCHITECTURE.md` for the security boundaries.

## 1. Establish an auth session

The web app initializes auth once through NestJS. If no registered or anonymous session exists, it calls:

```http
POST /auth/anonymous
Content-Type: application/json

{}
```

NestJS creates a Supabase anonymous user, returns the short-lived access token in the response, and stores only the refresh token in an HttpOnly cookie. The web app supplies that access token to its singleton Supabase client and Realtime connection.

## 2. Create or join

Anonymous channel creation and all joining use security-definer RPCs:

```typescript
await supabase.schema('guest').rpc('create_channel', {
  p_name: 'Project review',
  p_display_name: 'Alice', // omitted for registered users
});

await supabase.schema('guest').rpc('join_channel', {
  p_code: 'ABC12345',
  p_display_name: 'Bob', // omitted for registered users
});
```

Registered creators use the guarded NestJS endpoint so Zod and database validation both protect the advanced settings:

```http
POST /guest/channels
Content-Type: application/json

{ "name": "Project review", "maxParticipants": 20, "lifetimeMinutes": 120 }
```

Anonymous creators do not submit these settings and retain the 8-participant, 60-minute defaults.

The database derives the authenticated user from `auth.uid()`. Registered-user display names come from the authoritative profile; anonymous users provide a validated guest display name. Each active membership receives a stable LiveKit identity.

Direct navigation to `/guest/:inviteCode` restores the auth session, resolves the channel under RLS, restores an active membership, or calls `join_channel` when an authenticated registered user is eligible to join automatically.

## 3. Chat and reactions

The client reads only the active channel rows permitted by RLS and mutates data through these RPCs:

- `create_message`
- `edit_message`
- `delete_message`
- `toggle_message_reaction`

Optimistic messages carry a `client_message_id`. The store reconciles them against returned/database rows by row ID or client ID, preserving stable order without duplicates. Reply relationships store the real `reply_to` message UUID. Deletes are soft deletes, and edited messages retain their edited state.

## 4. Realtime membership and chat

One filtered Supabase Realtime channel subscribes to changes for:

- `guest.channels`
- `guest.channel_members`
- `guest.messages`
- `guest.message_reactions`

The store merges inserts, updates, and deletes into its local state and aggregates reactions by emoji and member ID. It removes the subscription when the room is destroyed or changes.

## 5. Calls

The web app requests a token from the protected NestJS endpoint:

```http
POST /livekit/token
Authorization: Bearer <supabase-access-token>
Content-Type: application/json

{ "channelId": "<guest-channel-uuid>" }
```

NestJS verifies the caller's active membership and the active, unexpired channel with its server-only Supabase client. It derives the display name, LiveKit identity, room name, and call capacity from authoritative rows, explicitly creates the LiveKit room with that `maxParticipants`, and then mints a short-lived, least-privilege token. Media flows directly between the browser and LiveKit.

## 6. Leave and close

Members leave explicitly with `leave_channel`. Owners close a room with `close_channel`; the channel becomes inactive and clients render the ended state. Route destruction only removes local Realtime resources and does not silently mutate membership.

## Verification

Run the repository baseline plus focused tests:

```bash
pnpm lint
pnpm --filter api exec tsc -p tsconfig.json --noEmit
pnpm --filter api exec jest --runInBand
pnpm --filter web exec vitest run src/app/features/guest-room/services/guest-channel.store.spec.ts
pnpm build
```
