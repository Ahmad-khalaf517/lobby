# Event & Endpoint Contract

This is the contract between `apps/api` and `apps/web`. Every event/endpoint here has a matching Zod schema in `packages/shared/src/schemas`. Runtime guards may be stricter than schema minimums for product behavior. **Don't add or change an event/endpoint here without updating the corresponding schema in the same change, and vice versa.**

Lock this before parallel work starts (Day 1 morning) — see the project plan.

Calls (voice + screen share) are **not** part of the Socket.IO contract below — see the "Calls" section at the bottom.

## REST

| Method & Path                   | Request    | Response                             | Schema                                                                          |
| ------------------------------- | ---------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `POST /channels`                | `{ name }` | `{ id, name, createdAt, expiresAt }` | `CreateChannelRequestSchema` + controller guard / `CreateChannelResponseSchema` |
| `GET /channels/:id`             | —          | `{ id, name, createdAt, expiresAt }` | `ChannelSchema`                                                                 |
| `GET /channels/:id/messages`    | —          | `{ messages: [...] }`                | `MessageHistorySchema`                                                          |
| `POST /channels/:id/call-token` | `{ name }` | `{ token, livekitUrl, roomName }`    | `CallTokenRequestSchema` / `CallTokenResponseSchema`                            |

## Socket.IO — Client → Server

| Event          | Payload                         | Schema                      |
| -------------- | ------------------------------- | --------------------------- |
| `joinChannel`  | `{ channelId, name }`           | `JoinChannelPayloadSchema`  |
| `chatMessage`  | `{ channelId, name, text }`     | `ChatMessagePayloadSchema`  |
| `typing`       | `{ channelId, name, isTyping }` | `TypingPayloadSchema`       |
| `leaveChannel` | `{ channelId }`                 | `LeaveChannelPayloadSchema` |

## Socket.IO — Server → Client

| Event         | Payload                                          | Schema                       |
| ------------- | ------------------------------------------------ | ---------------------------- |
| `userJoined`  | `{ name, socketId }`                             | `UserPresenceSchema`         |
| `userLeft`    | `{ name, socketId }`                             | `UserPresenceSchema`         |
| `chatMessage` | `{ id, channelId, authorName, text, createdAt }` | `ChatMessageBroadcastSchema` |
| `typing`      | `{ name, isTyping }`                             | `TypingBroadcastSchema`      |
| `memberList`  | `{ members: [...] }`                             | `MemberListSchema`           |

Import event names from `SOCKET_EVENTS` (`packages/shared/src/constants/socket-events.ts`) — never hardcode the string literal.

## Calls (voice + screen share) — not a socket event

There is intentionally **no** `joinCall`/`webrtcSignal`/etc. socket event. The flow is:

1. Frontend calls `POST /channels/:id/call-token` (above) to get a LiveKit token.
2. Frontend connects directly to LiveKit Cloud with that token, using `livekit-client`.

Socket.IO and `apps/api`'s gateway are not involved in the call path at all past minting the token. See `docs/ARCHITECTURE.md` for the full flow diagram and reasoning.

## Validation on both ends

```typescript
// apps/api — inside the gateway handler
@SubscribeMessage(SOCKET_EVENTS.CHAT_MESSAGE)
handleChatMessage(@MessageBody() payload: unknown) {
  const data = ChatMessagePayloadSchema.parse(payload); // throws on invalid shape
  // ...
}
```

```typescript
// apps/web — inside the chat service, before emitting
sendMessage(payload: ChatMessagePayload) {
  ChatMessagePayloadSchema.parse(payload); // fail fast on the client too
  this.socket.emit(SOCKET_EVENTS.CHAT_MESSAGE, payload);
}
```

## Adding a new event or endpoint

1. Add the Zod schema to `packages/shared/src/schemas`.
2. Export it from `packages/shared/src/index.ts`.
3. If it's a socket event, add the name to `packages/shared/src/constants/socket-events.ts`.
4. Add a row to the appropriate table above.
5. Only then wire it up in `apps/api` and `apps/web`.
