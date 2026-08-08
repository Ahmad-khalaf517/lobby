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

| Method and path                        | Request                     | Response                          | Shared schema                                                                  |
| -------------------------------------- | --------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `POST /livekit/token`                  | `{ channelId }`             | `{ token, livekitUrl, roomName }` | `CallTokenRequestSchema` / `CallTokenResponseSchema`                           |
| `GET /channels/:channelId/call-status` | authenticated member cookie | `{ active, participants }`        | `CallStatusResponseSchema`                                                     |
| `POST /livekit/remove-participant`     | `{ channelId, memberId }`   | `{ removed }`                     | `CallParticipantRemovalRequestSchema` / `CallParticipantRemovalResponseSchema` |

NestJS resolves the member display name, LiveKit identity, room name, and membership authority from the `guest` schema. The browser must not submit those values.

## Guest database contract

Guest reads and mutations do not cross the NestJS REST or Socket.IO boundary. Angular uses its user-scoped Supabase JWT with:

- RLS-protected reads from `guest.channels`, `guest.channel_members`, `guest.messages`, and `guest.message_reactions`.
- RPC mutations: `guest.create_channel`, `guest.join_channel`, `guest.create_message`, `guest.edit_message`, `guest.delete_message`, `guest.toggle_message_reaction`, `guest.leave_channel`, and `guest.close_channel`.
- Owner moderation RPCs: `guest.kick_channel_member` and `guest.block_channel_member`. Blocks are stored in `guest.channel_blocks` and enforced by `guest.join_channel`.
- One filtered Supabase Realtime subscription per active guest channel.

The old public-channel REST controllers and `ChannelGateway` have been removed. There is no Socket.IO guest chat contract.

## Calls

Voice and screen sharing are not application events. Angular requests a restricted token from NestJS and connects directly to LiveKit. NestJS never handles media.
