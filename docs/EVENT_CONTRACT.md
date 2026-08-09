# Event & Endpoint Contract

This is the active contract between `apps/api` and `apps/web`. Cross-boundary payloads are defined by Zod schemas in `packages/shared`.

## Authentication REST endpoints

| Method and path                  | Request                                          | Response                           | Shared schema                                               |
| -------------------------------- | ------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------- |
| `POST /auth/login`               | `{ email, password }`                            | `{ user, accessToken, expiresAt }` | `LoginRequestSchema` / `AuthSessionResponseSchema`          |
| `POST /auth/anonymous`           | `{ captchaToken? }`                              | `{ user, accessToken, expiresAt }` | `AnonymousAuthRequestSchema` / `AuthSessionResponseSchema`  |
| `GET /auth/me`                   | HttpOnly auth cookies                            | `{ user, accessToken, expiresAt }` | `CurrentUserResponseSchema`                                 |
| `POST /auth/refresh`             | HttpOnly refresh cookie                          | `{ user, accessToken, expiresAt }` | `AuthSessionResponseSchema`                                 |
| `POST /auth/logout`              | HttpOnly auth cookies                            | `{ message }`                      | `AuthMessageResponseSchema`                                 |
| `POST /auth/register`            | `{ name, email, password, confirmPassword }`     | `{ message, user? }`               | `RegisterRequestSchema` / `RegistrationResponseSchema`      |
| `POST /auth/confirm-email`       | `{ tokenHash, type: 'email' }`                   | `{ user, accessToken, expiresAt }` | `ConfirmEmailRequestSchema` / `AuthSessionResponseSchema`   |
| `POST /auth/resend-confirmation` | `{ email }`                                      | `{ message }`                      | `EmailRequestSchema` / `AuthMessageResponseSchema`          |
| `POST /auth/forgot-password`     | `{ email }`                                      | `{ message }`                      | `EmailRequestSchema` / `AuthMessageResponseSchema`          |
| `POST /auth/verify-recovery`     | `{ tokenHash }`                                  | `{ user, accessToken, expiresAt }` | `VerifyRecoveryRequestSchema` / `AuthSessionResponseSchema` |
| `POST /auth/reset-password`      | `{ password, confirmPassword }`                  | `{ message }`                      | `ResetPasswordRequestSchema` / `AuthMessageResponseSchema`  |
| `POST /auth/change-password`     | `{ currentPassword, password, confirmPassword }` | `{ message }`                      | `ChangePasswordRequestSchema` / `AuthMessageResponseSchema` |

`accessToken` is held only in Angular memory. The refresh token is never returned to JavaScript and remains in an HttpOnly cookie. `user.isAnonymous` distinguishes anonymous and registered sessions. `verify-recovery` also establishes a short-lived HttpOnly recovery proof bound to that refresh token; `reset-password` requires it, while `change-password` requires a registered signed-in session and the current password.

Unsafe cookie-authenticated requests (`POST`, `PUT`, `PATCH`, and `DELETE`) must carry a trusted `Origin` (or trusted `Referer` fallback) matching the configured CORS origins. Cookie-free public authentication requests remain available without this CSRF check.

## LiveKit REST endpoints

| Method and path                                     | Request                                   | Response                                    | Shared schema                                                                  |
| --------------------------------------------------- | ----------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `POST /livekit/token`                               | `{ channelId }`                           | `{ token, livekitUrl, roomName }`           | `CallTokenRequestSchema` / `CallTokenResponseSchema`                           |
| `GET /channels/:channelId/call-status`              | authenticated member cookie               | `{ active, participants, maxParticipants }` | `CallStatusResponseSchema`                                                     |
| `POST /livekit/remove-participant`                  | `{ channelId, memberId }`                 | `{ removed }`                               | `CallParticipantRemovalRequestSchema` / `CallParticipantRemovalResponseSchema` |
| `POST /server-channels/:channelId/call-token`       | empty body; registered member cookie      | `{ token, livekitUrl, roomName }`           | `CallTokenResponseSchema`                                                      |
| `GET /server-channels/:channelId/call-status`       | registered member cookie                  | `{ active, participants, maxParticipants }` | `CallStatusResponseSchema`                                                     |
| `POST /dm-conversations/:conversationId/call-token` | empty body; registered participant cookie | `{ token, livekitUrl, roomName }`           | `CallTokenResponseSchema`                                                      |
| `GET /dm-conversations/:conversationId/call-status` | registered participant cookie             | `{ active, participants, maxParticipants }` | `CallStatusResponseSchema`                                                     |

NestJS resolves the member display name, LiveKit identity, room name, configured call capacity, and membership authority from the `guest` schema. Before minting a token, it explicitly creates the LiveKit room with the stored `maxParticipants`; the browser must not submit these values.

The server-channel routes stack `RegisteredUserGuard` after cookie authentication. NestJS resolves the submitted channel UUID to its server, requires current `server_members` access, and rejects any left or removed `channel_members` row. The token endpoint lazily creates a missing eligible channel membership, matching authenticated chat access; the status GET remains read-only. NestJS derives the LiveKit room (`server-channel:<channel UUID>`), participant identity, display name, grants, and capacity. The browser cannot choose a server, room, member identity, or publishing grants. Guest routes and their anonymous access remain unchanged.

DM call routes are registered-only and accept only a conversation UUID. NestJS
requires the current user to be one of that conversation's two participants,
rejects either-direction blocks, derives the room as
`dm-conversation:<conversation UUID>`, derives identity/name server-side, and
caps the room at two participants. They reuse the same microphone and
screen-share-only LiveKit grants and shared browser call service as channel and
Guest calls; camera publication remains unavailable.

## Registered guest-channel creation

| Method and path        | Request                                      | Response              | Shared schema                                                          |
| ---------------------- | -------------------------------------------- | --------------------- | ---------------------------------------------------------------------- |
| `POST /guest/channels` | `{ name, maxParticipants, lifetimeMinutes }` | `{ channelId, code }` | `GuestChannelCreateRequestSchema` / `GuestChannelCreateResponseSchema` |

This endpoint accepts registered Supabase users only. NestJS derives the creator from the HttpOnly-cookie session and calls the existing `guest.create_channel` RPC with that user's JWT. Anonymous creators continue to call the RPC with only the room and display names, receiving the existing defaults of 8 call participants and 60 minutes.

## Authenticated server-channel database contract

Ordinary authenticated channel chat does not cross the NestJS REST boundary. Angular uses the registered user's short-lived Supabase JWT with:

- RLS-protected history reads from `public.messages` and `public.message_reactions`.
- RPC mutations: `public.join_authenticated_channel_chat`, `public.create_authenticated_channel_message`, `public.edit_authenticated_channel_message`, `public.delete_authenticated_channel_message`, and `public.toggle_authenticated_channel_message_reaction`.
- The read-only mapping RPC `public.list_authenticated_channel_chat_members` for author names and avatars.
- One filtered Supabase Realtime subscription per active channel.

The RPCs accept channel/message/content/client-message/reply/emoji values only. They derive the user and normalized channel member from `auth.uid()`, reject anonymous JWTs, require both server membership and active channel membership, and restrict edit/delete to the sender. Initial chat access may create a missing `channel_members` row from an existing `server_members` role; a left or removed membership is never reactivated.

`client_message_id` is a browser-generated UUID unique per sender membership, making create retries idempotent and allowing optimistic rows to deduplicate against RPC and Realtime results. The browser keeps SELECT only on the two chat tables; raw INSERT/UPDATE/DELETE remain revoked. Only the named security-definer functions have `authenticated` execute grants.

## Direct-message database contract

NestJS remains the registered-session and conversation business authority:

| Method and path | Request                   | Response                      | Shared schema                                    |
| --------------- | ------------------------- | ----------------------------- | ------------------------------------------------ |
| `GET /dms`      | registered cookie session | conversation list             | `DmListResponseSchema`                           |
| `POST /dms`     | `{ userId }`              | existing/new 1:1 conversation | `CreateDmRequestSchema` / `DmConversationSchema` |

Ordinary DM history and message operations do not cross NestJS. Angular uses
the registered user's Supabase JWT with participant-scoped SELECT policies on
`public.dm_conversations` and `public.dm_messages`, plus narrow create, edit,
delete, reaction, mark-read, and clear-conversation RPCs.

The functions derive the caller from `auth.uid()`, reject anonymous sessions,
and require 1:1 participation. Create is idempotent by sender plus browser UUID;
edit/delete are owner-only. Clearing advances only the caller's visibility
boundary and never removes the other participant's history. Raw DM mutations
remain revoked.

Notifications are self-readable and their `is_read`/`read_at` columns are
self-updatable through RLS. Friendship and current-user server-membership rows
are self/participant-readable for Realtime refresh only; privileged mutations
remain NestJS operations.

## Server lifecycle REST endpoints

| Method and path           | Authority                                 | Result                                       |
| ------------------------- | ----------------------------------------- | -------------------------------------------- |
| `POST /servers/:id/leave` | current registered member; owner rejected | removes caller membership                    |
| `DELETE /servers/:id`     | owner only                                | deletes server and cascading dependent state |

## Guest database contract

Guest reads and most mutations do not cross the NestJS REST or Socket.IO boundary. Angular uses its user-scoped Supabase JWT with:

- RLS-protected reads from `guest.channels`, `guest.channel_members`, `guest.messages`, and `guest.message_reactions`.
- RPC mutations: `guest.create_channel`, `guest.join_channel`, `guest.create_message`, `guest.edit_message`, `guest.delete_message`, `guest.toggle_message_reaction`, `guest.leave_channel`, and `guest.close_channel`. Registered creation is routed through NestJS so advanced configuration receives Zod validation; anonymous creation remains a browser RPC using database defaults.
- Owner moderation RPCs: `guest.kick_channel_member` and `guest.block_channel_member`. Blocks are stored in `guest.channel_blocks` and enforced by `guest.join_channel`.
- One filtered Supabase Realtime subscription per active guest channel.

The old public-channel REST controllers and `ChannelGateway` have been removed. There is no Socket.IO guest chat contract.

## Calls

Voice and screen sharing are not application events. Angular requests a restricted token from NestJS and connects directly to LiveKit. NestJS never handles media.
