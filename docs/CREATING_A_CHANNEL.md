# Creating and Using a Channel

This walks through the full lifecycle of a channel — creation, joining, chat, typing,
presence, and leaving — from both the backend (NestJS) and frontend (Angular)
implementation perspective. It reflects the actual working implementation in
`apps/api/src/channels` and `apps/api/src/gateway`, verified end-to-end against a real
Supabase project (see "How this was tested" at the bottom).

Every payload shape referenced here is defined once in `packages/shared` and is not
duplicated anywhere — see `docs/EVENT_CONTRACT.md` for the full reference table.

## 1. Creating a channel (REST)

**`POST /channels`** — `apps/api/src/channels/channels.controller.ts` →
`ChannelsController.create`

```
POST http://localhost:3000/channels
Content-Type: application/json

{ "name": "Test Room" }
```

`name` is optional (`CreateChannelRequestSchema` in `packages/shared/src/schemas/channel.schema.ts`) —
omit it and the server defaults to `"New room"` (`ChannelRepository.createChannel`,
`apps/api/src/database/channel.repository.ts`).

Response (`CreateChannelResponseSchema` = `ChannelSchema`):

```json
{
  "id": "8OghXWSA",
  "name": "Test Room",
  "createdAt": "2026-08-01T09:37:13.897809+00:00",
  "expiresAt": "2026-08-02T09:37:13.188+00:00"
}
```

- `id` is an 8-character `nanoid` — this **is** the shareable room code (e.g. the frontend
  would build a link like `yourapp.com/channel/8OghXWSA`). There is no separate "join code"
  — knowing the `id` is the entire access-control model for this no-auth app.
- `expiresAt` defaults to 24 hours out (`ttlHours = 24` in `createChannel`); `null` means no
  expiry. Nothing currently enforces expiry automatically — see `supabase/schema.sql`'s
  `delete_expired_channels()` function, meant to be run as a scheduled job.
- Note the `+00:00` timestamp suffix — Supabase/PostgREST serializes `timestamptz` this way,
  not with a `Z` suffix, which is why `ChannelSchema`/`MessageSchema` use
  `z.string().datetime({ offset: true })`.

**Fetching a channel back**: `GET /channels/:id` → same shape, 404s
(`{ "message": "Channel not found or expired", "error": "Not Found", "statusCode": 404 }`)
if the `id` doesn't exist or was deleted.

**Backfilling history**: `GET /channels/:id/messages` → `{ "messages": [...] }`
(`MessageHistorySchema`), oldest first. Also 404s the same way for an unknown channel —
this is what a frontend calls once, on first opening a channel, before connecting the
socket, so a client that joins after messages already exist still sees the full history.

**From the frontend**: this is a plain HTTP call — no socket involved yet. In Angular this
would be an `HttpClient` call in a `ChannelService`, e.g.:

```typescript
createChannel(name?: string): Observable<Channel> {
  return this.http.post<Channel>('/channels', { name } satisfies CreateChannelRequest);
}
```

(`Channel`/`CreateChannelRequest` imported from `@lobby/shared` — never hand-write this
shape in `apps/web`.)

## 2. Joining over the socket

Once a client has a channel `id` (from creating one, or from a link someone shared), it
connects to the Socket.IO gateway and emits `joinChannel`:

```typescript
socket.emit(SOCKET_EVENTS.JOIN_CHANNEL, { channelId, name } satisfies JoinChannelPayload);
```

Handled by `ChannelGateway.handleJoinChannel` (`apps/api/src/gateway/channel.gateway.ts`):

1. Validates the payload against `JoinChannelPayloadSchema`.
2. Confirms the channel actually exists via `ChannelRepository.findChannel` — if it
   doesn't (deleted/expired/typo'd id), the client receives a Socket.IO `exception` event:
   `{ status: 'error', message: 'Channel not found or expired' }` (a `NotFoundException`
   from the repository is caught and rethrown as a `WsException` specifically so the
   message is meaningful instead of Nest's generic "Internal server error" fallback).
3. Joins the underlying Socket.IO room (`client.join(channelId)`).
4. Tracks the member in-memory (`channelMembers: Map<channelId, Map<socketId, name>>`) —
   **not** persisted, see §4.
5. Broadcasts to everyone _else_ already in the room: `userJoined` → `{ name, socketId }`.
6. Broadcasts to the **whole room** (including the joiner): `memberList` →
   `{ members: [{ name, socketId }, ...] }`.

A socket belongs to one channel at a time — joining a new `channelId` implicitly runs the
same cleanup as leaving the previous one first, so state never gets orphaned if a client
switches channels without explicitly leaving.

## 3. Chat flow

```typescript
socket.emit(SOCKET_EVENTS.CHAT_MESSAGE, { channelId, name, text } satisfies ChatMessagePayload);
```

`ChannelGateway.handleChatMessage`:

1. Validates against `ChatMessagePayloadSchema`.
2. Persists via `ChannelRepository.addMessage` (insert into Supabase `messages` table).
3. Broadcasts the **stored row** (not a reshaping of the inbound payload) to the entire
   room, including the sender:

```json
{
  "id": "f4029fb5-aa92-4597-8280-534ba832c031",
  "channelId": "8OghXWSA",
  "authorName": "Alice",
  "text": "hello from Alice",
  "createdAt": "2026-08-01T09:38:35.492069+00:00"
}
```

Every client — including the one who sent it — ends up displaying the same `id` and
`createdAt` the database assigned, rather than trusting a locally-generated optimistic
value. This is also why a client that calls `GET /channels/:id/messages` afterwards sees
the identical row.

## 4. Typing indicator & presence (in-memory only)

```typescript
socket.emit(SOCKET_EVENTS.TYPING, { channelId, name, isTyping } satisfies TypingPayload);
```

`ChannelGateway.handleTyping` broadcasts `{ name, isTyping }` to everyone else in the room
(not back to the sender, and with no `channelId`/`socketId` in the payload — targeting is
done via the Socket.IO room, not the payload).

**Important**: typing state and the `channelMembers`/`socketChannel` maps in
`ChannelGateway` are plain in-memory `Map`s — restarting the API wipes all of it. This is
intentional (see `docs/PROJECT_PLAN.md`, risk #5) and mirrors the persistence split: only
**channels and messages** survive a restart (Supabase); who's currently online and who's
mid-keystroke does not.

## 5. Leaving / disconnecting

```typescript
socket.emit(SOCKET_EVENTS.LEAVE_CHANNEL, { channelId } satisfies LeaveChannelPayload);
```

An explicit `leaveChannel` and an implicit disconnect (dropped connection, closed tab) go
through the exact same cleanup path (`ChannelGateway.removeFromChannel`): remove the member
from the in-memory map, broadcast `userLeft` → `{ name, socketId }`, and — if anyone's still
in the room — an updated `memberList`. If the departing member was the last one in the
room, no `memberList` is sent (there's no one left to send it to) and the channel's entry is
dropped from the map entirely.

## 6. Known MVP tradeoffs (deliberate, not oversights)

- **Gateway CORS is permissive** (`cors: { origin: true }` in `channel.gateway.ts`) rather
  than locked to `CORS_ORIGIN` like the REST layer (`main.ts`'s `enableCors`). This is
  because `shipped/socket-dev-console.html` is opened via `file://`, which sends
  `Origin: null` — Socket.IO enforces its own origin check independent of browser CORS, so
  a locked-down origin would reject the dev console entirely. Sockets never carry the
  Supabase service-role key or any secret, and "knowing the channel id" is already this
  app's access-control model, so this is a narrow, deliberate relaxation. Tighten this once
  `apps/web` (not the dev console) is the only real client.
- **WS validation errors are generic** for anything other than the "channel not found" case
  — a malformed payload (failing `.parse()`) surfaces to the client as Nest's default
  `{ status: 'error', message: 'Internal server error' }` rather than the actual Zod error.
  The real error is still logged server-side. Fine for MVP; revisit with a custom
  `WsExceptionFilter` if better client-side validation feedback is needed later.

## How this was tested

With a real Supabase project (schema from `supabase/schema.sql` applied) and
`apps/api/.env` filled in, `pnpm dev:api` boots cleanly and logs every route/gateway
subscription. Verified via:

- `curl`/`Invoke-RestMethod` against all three REST endpoints (create, get, get messages),
  including the 404 paths.
- Two simulated `socket.io-client` connections (Alice, Bob) exercising the full sequence:
  join → `memberList`/`userJoined` → chat → persisted broadcast → typing on/off → explicit
  leave → `userLeft`/`memberList` → disconnect cleanup — plus a bad-channel-id join
  confirming the `exception` event fires with the right message.
- A connection with an explicit `Origin: null` header (matching what
  `shipped/socket-dev-console.html` sends when opened directly from disk), confirming the
  gateway's CORS setting accepts it.

You can re-run the same checks yourself:

1. `pnpm dev:api` (needs `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env`, and
   `supabase/schema.sql` applied to that project).
2. Create a channel with the `curl`/`Invoke-RestMethod` call in §1, note the `id`.
3. Open `shipped/socket-dev-console.html` directly in two browser tabs, set the same
   Channel ID in both with different display names, and click through Connect → Join
   channel → the Quick Actions buttons (Send "hello", Typing on/off, Leave) in each tab,
   watching the other tab's event log update in real time.
