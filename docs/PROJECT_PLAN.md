# Lobby Project Plan

This document records the current implementation direction. The authoritative technical contracts are `docs/EVENT_CONTRACT.md` and `docs/ARCHITECTURE.md`.

## Current architecture

- Angular is the UI and the direct client for guest-schema reads, RPCs, and Realtime.
- Supabase Auth supplies registered and anonymous identities.
- The `guest` schema owns ephemeral channels, members, messages, and reactions.
- Row Level Security and database RPCs enforce guest-channel authorization.
- NestJS owns authentication session exchange, registered application modules, and secure LiveKit token minting.
- LiveKit carries microphone and screen-share media directly; NestJS never handles media.

## Delivered guest scope

- Anonymous session creation and restoration without storing tokens in local storage.
- Create and join by invite code, including registered-profile display names.
- Persistent memberships and refresh-safe room restoration.
- Realtime members, messages, edits, soft deletes, replies, and reactions.
- Optimistic message reconciliation by `client_message_id`.
- Explicit leave and owner close behavior.
- Membership-authorized LiveKit token creation using database-owned room and participant identities.
- Removed legacy public guest REST and Socket.IO paths.

## Remaining operational validation

Before a production release, validate the deployed environment with separate real users and networks:

1. Apply all Supabase migrations and confirm the `guest` schema is exposed for API and Realtime.
2. Exercise create/join/chat/reactions/edit/delete/leave/close with at least three independent browser profiles.
3. Test LiveKit microphone and screen sharing across browsers and networks, including autoplay handling and reconnect.
4. Verify CAPTCHA settings if anonymous sign-in abuse protection is enabled.
5. Configure expiry cleanup and monitor channel/member/message growth.

## Engineering baseline

Run lint, the API TypeScript check, focused tests, and the full workspace build before merging. Any database RPC or HTTP payload change must update the shared schema where applicable and `docs/EVENT_CONTRACT.md` in the same change.
