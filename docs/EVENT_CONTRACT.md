# Event & Endpoint Contract

This is the active contract between `apps/api` and `apps/web`. Cross-boundary payloads are defined by Zod schemas in `packages/shared`.

## Authentication REST endpoints

| Method and path                  | Request                                      | Response                           | Shared schema                                               |
| -------------------------------- | -------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `POST /auth/login`               | `{ email, password }`                        | `{ user, accessToken, expiresAt }` | `LoginRequestSchema` / `AuthSessionResponseSchema`          |
| `POST /auth/anonymous`           | `{ captchaToken? }`                          | `{ user, accessToken, expiresAt }` | `AnonymousAuthRequestSchema` / `AuthSessionResponseSchema`  |
| `GET /auth/me`                   | HttpOnly auth cookies                        | `{ user, accessToken, expiresAt }` | `CurrentUserResponseSchema`                                 |
| `POST /auth/refresh`             | HttpOnly refresh cookie                      | `{ user, accessToken, expiresAt }` | `AuthSessionResponseSchema`                                 |
| `POST /auth/logout`              | HttpOnly auth cookies                        | `{ message }`                      | `AuthMessageResponseSchema`                                 |
| `POST /auth/register`            | `{ name, email, password, confirmPassword }` | `{ message, user? }`               | `RegisterRequestSchema` / `RegistrationResponseSchema`      |
| `POST /auth/confirm-email`       | `{ tokenHash, type: 'email' }`               | `{ user, accessToken, expiresAt }` | `ConfirmEmailRequestSchema` / `AuthSessionResponseSchema`   |
| `POST /auth/resend-confirmation` | `{ email }`                                  | `{ message }`                      | `EmailRequestSchema` / `AuthMessageResponseSchema`          |
| `POST /auth/forgot-password`     | `{ email }`                                  | `{ message }`                      | `EmailRequestSchema` / `AuthMessageResponseSchema`          |
| `POST /auth/verify-recovery`     | `{ tokenHash }`                              | `{ user, accessToken, expiresAt }` | `VerifyRecoveryRequestSchema` / `AuthSessionResponseSchema` |
| `POST /auth/reset-password`      | `{ password, confirmPassword }`              | `{ message }`                      | `ResetPasswordRequestSchema` / `AuthMessageResponseSchema`  |

`accessToken` is held only in Angular memory. The refresh token is never returned to JavaScript and remains in an HttpOnly cookie. `user.isAnonymous` distinguishes anonymous and registered sessions.

## LiveKit REST endpoints

| Method and path                        | Request                     | Response                          | Shared schema                                        |
| -------------------------------------- | --------------------------- | --------------------------------- | ---------------------------------------------------- |
| `POST /livekit/token`                  | `{ channelId }`             | `{ token, livekitUrl, roomName }` | `CallTokenRequestSchema` / `CallTokenResponseSchema` |
| `GET /channels/:channelId/call-status` | authenticated member cookie | `{ active, participants }`        | `CallStatusResponseSchema`                           |

NestJS resolves the member display name, LiveKit identity, room name, and membership authority from the `guest` schema. The browser must not submit those values.

## Notification REST endpoints

| Method and path                | Request                   | Response                               | Shared schema                    |
| ------------------------------ | ------------------------- | -------------------------------------- | -------------------------------- |
| `GET /notifications`           | authenticated auth cookie | newest-first `Notification[]` (max 50) | `NotificationListResponseSchema` |
| `POST /notifications/read-all` | authenticated auth cookie | `{ message }`                          | `AuthMessageResponseSchema`      |

Notification rows are written by NestJS (service-role key) as side effects of the real action: friend request received, friend request accepted, and a new DM message (`type: 'message'`; `message_id` stays null because that FK references the channel `messages` table). The Angular app loads the inbox from `GET /notifications`, prepends live Realtime inserts, and marks items read when the panel opens.

## Guest database contract

Guest reads and mutations do not cross the NestJS REST boundary. Angular uses its user-scoped Supabase JWT with:

- RLS-protected reads from `guest.channels`, `guest.channel_members`, `guest.messages`, and `guest.message_reactions`.
- RPC mutations: `guest.create_channel`, `guest.join_channel`, `guest.create_message`, `guest.edit_message`, `guest.delete_message`, `guest.toggle_message_reaction`, `guest.leave_channel`, and `guest.close_channel`.
- One filtered Supabase Realtime subscription per active guest channel.

The old public-channel REST controllers and `ChannelGateway` have been removed. There is no Socket.IO guest chat contract.

## Calls

Voice and screen sharing are not application events. Angular requests a restricted token from NestJS and connects directly to LiveKit. NestJS never handles media.

## Authenticated realtime (Supabase Realtime)

Signed-in DMs, friendships, and friend notifications arrive over Supabase Realtime, using the same user-scoped Supabase JWT as the guest schema. Writes never cross this path — NestJS persists everything with the service-role key, and Angular only subscribes. Delivery is scoped by RLS SELECT policies (see `apps/api/supabase/migrations/20260809100000_enable_dm_realtime.sql`): a user receives events only for conversations they belong to, friendships they participate in, and notifications addressed to them.

| Table              | Events subscribed by `apps/web`   | Effect in the client                                                                      |
| ------------------ | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `dm_messages`      | INSERT / UPDATE / DELETE          | Append message, apply edit/reaction, remove message; **toast** for a new incoming message |
| `dm_conversations` | INSERT                            | Refresh the conversation list (new conversation appears)                                  |
| `friendships`      | `*`                               | `FriendsService` refetches all friendship lists                                           |
| `notifications`    | INSERT (filter `user_id=eq.<me>`) | Prepend to the notification inbox (bell); refresh friends lists on request/accept         |

Toasts are reserved for new DM messages (`dm_messages` INSERT via `DirectMessagesService`). Friend requests, accepts, and other system events surface in the bell dropdown inbox instead; clicking a `friend_request` notification deep-links to the Pending tab (`/app/friends?tab=pending`).

There is no Socket.IO transport in this project.
