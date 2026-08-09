# Feature Details

## Identity and session lifecycle

The Angular app initializes auth once through NestJS. Registered and anonymous sessions share the same response contract: a user, expiry, and a short-lived access token. The refresh token remains in an HttpOnly cookie. Angular keeps the access token in memory and applies it to the singleton Supabase client and Realtime connection.

`POST /auth/anonymous` reuses a valid access session or refresh cookie before creating another anonymous user. Optional CAPTCHA proof can be forwarded when abuse protection is configured.

During normal runtime, protected NestJS requests use the HttpOnly access-token cookie. If it has expired, `SupabaseAuthGuard` returns 401 and Angular's auth interceptor starts one shared `POST /auth/refresh` request for all waiting callers. NestJS gives the HttpOnly refresh token to Supabase, replaces **both** rotated cookies, Angular updates its in-memory Supabase/Realtime access token, and each original request is retried once.

If Supabase rejects the refresh session, NestJS clears both cookies and Angular clears local auth state. A retryable Supabase/network outage does not erase an otherwise valid session, and login, logout, and refresh requests are excluded from recursive retry.

## Guest channels

The `guest` schema contains channels, members, messages, and reactions. Security-definer RPCs implement create, join, message mutation, reaction toggle, leave, and close operations. Every function derives identity from `auth.uid()` and validates active membership. RLS limits reads to authorized active members.

Anonymous users supply a display name when creating or joining. Registered users do not override their profile name. Invite codes are normalized before lookup; internal channel IDs are UUIDs and are not used as public join codes.

## Client state and Realtime

`GuestChannelStore` owns room initialization and teardown. It loads the active channel snapshot, subscribes to filtered Supabase Realtime changes, and merges member/message/reaction changes without replacing optimistic state incorrectly.

Messages include a `client_message_id`, allowing an optimistic row to reconcile with both an RPC response and a Realtime insert without duplication. Replies persist a message UUID. Edits preserve edited metadata; deletes are soft deletes. Reactions aggregate by emoji and membership ID so duplicate display names are safe.

Reloading `/guest/:inviteCode` restores the auth session and active membership. Leaving is explicit; destroying the Angular route only removes the Realtime subscription.

## LiveKit

`POST /livekit/token` accepts only a guest channel UUID. NestJS looks up the authenticated user's active member row and the active, unexpired channel through server-only Supabase access. The room name, display name, and LiveKit identity come from those authoritative rows.

Tokens are short lived and permit room join, subscribe, microphone publication, and screen sharing. They do not grant room administration, arbitrary data publication, or camera publication. The frontend connects directly to LiveKit and attaches remote audio tracks to real audio elements, reporting autoplay failures to the user.

## Removed legacy surface

The old public guest channel controllers, repositories, Socket.IO gateway, browser socket service, socket-only shared payloads, and socket proxy configuration have been removed. Registered application modules that still use the public schema remain separate from the guest dashboard.

## Operations

Production readiness still requires deployed multi-profile and cross-network LiveKit testing, CAPTCHA decisions, expiry cleanup scheduling, and normal Supabase/LiveKit monitoring. See `docs/PROJECT_PLAN.md`.
