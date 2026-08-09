# Guest Dashboard Explained

This guide describes the Guest Dashboard as it exists now. It focuses on the path from an invite link to chat, room membership, audio, screen sharing, moderation, and cleanup.

## What is the Guest Dashboard?

A Guest Channel is a temporary, link-to-join room. A user can join with an invite, chat, reply, edit, delete, react, see the room roster, and optionally join an audio call or share a screen.

The main pieces are:

```text
                         Angular Guest Dashboard
                        /           |           \
                       v            v            v
                 NestJS REST   Supabase guest   LiveKit Cloud
                 auth, trusted  data, RPC,       audio and
                 operations,    RLS, Realtime    screen share
                 call tokens
```

Angular does not send guest chat through NestJS or Socket.IO. It uses the current user's short-lived Supabase token to read the `guest` schema, call database RPCs, and receive Realtime database changes. NestJS is the trusted boundary for authentication, registered-room configuration, and LiveKit authorization. Media travels directly between the browser and LiveKit.

The main frontend files are `guest-room-page.ts`, `guest-channel.store.ts`, and `livekit-call.service.ts`. The database behavior comes from the migrations under `apps/api/supabase/migrations`. Trusted call behavior is in `calls.service.ts`.

## The four identities and lists to keep separate

Several similar-looking concepts mean different things:

| Concept             | What it means in Lobby                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Supabase user       | The authenticated identity from `auth.uid()`. It can be a registered user or a Supabase Anonymous Auth user.                        |
| Channel member      | A `guest.channel_members` row that has not been left or removed. This is what the room roster currently shows.                      |
| LiveKit participant | A browser currently connected to the media call. This drives speaking, mute, and screen-share state.                                |
| Realtime connection | The dashboard's subscription to Supabase database changes. The UI's “Connected” label refers to this, not to a person being online. |

Joining the Guest Channel is therefore **not** the same as joining the call:

```text
After opening/joining the room:  channel member = yes, LiveKit participant = no
After clicking Join Call:        channel member = yes, LiveKit participant = yes
After leaving only the call:     channel member = yes, LiveKit participant = no
```

This separation lets people use chat without granting microphone permission or consuming a LiveKit call slot.

## Creating a Guest Channel

Both anonymous and registered Supabase users can create a room, but the route differs:

- An anonymous creator supplies a display name. `GuestChannelStore.create()` calls the user-scoped `guest.create_channel` RPC directly. The room uses the defaults of 8 call participants, 60 minutes, and 25 channel memberships.
- A registered creator uses `POST /guest/channels`. `GuestChannelsController` validates the request with the shared Zod schema, rejects anonymous accounts, and calls the same RPC with a user-scoped Supabase client. Registered creators may choose a call capacity from 2 to 50 and a lifetime from 5 to 180 minutes; the UI offers 30, 60, 120, or 180 minutes. Their channel-membership limit is fixed at 100.

Inside `guest.create_channel(...)`, one database transaction:

```text
Create Channel
     -> create guest.channels row
     -> create owner's guest.channel_members row
     -> link owner_member_id to that member
     -> return channel ID, code, room name, and expiry
     -> load the Guest Dashboard
```

The channel ID and owner member ID are generated UUIDs. The current invite code generator returns a unique 10-character uppercase value derived from a UUID. The stored LiveKit room name uses the format `guest-<channel-uuid>`.

Every membership gets a stable `livekit_identity` of `member:<member-uuid>`. It is based on the membership UUID rather than a display name, so duplicate names and name changes do not confuse LiveKit.

The share dialog builds `/guest/<invite-code>` on the current site. Its QR image, produced by `uqr`, contains that full invite URL; it does not contain a special credential beyond the same link/code.

## Opening an invite and joining

The route is `/guest/:inviteCode`. `GuestRoomPage` asks `GuestChannelStore.restore()` to restore the room before showing it.

```text
Open Invite
    -> restore Supabase session through NestJS
    -> find an existing membership under RLS, if one exists
    -> otherwise collect/resolve a display name
    -> call guest.join_channel(code, optional name)
    -> load channel, current member, roster, messages, and reactions
    -> subscribe to Realtime
    -> optionally join LiveKit later
```

### Anonymous user

“Anonymous” does not mean unauthenticated. `AuthService.ensureGuestSession()` calls NestJS `POST /auth/anonymous`. NestJS first tries to reuse the access/refresh cookies; only when neither can restore a session does it call Supabase `signInAnonymously()`.

The resulting Supabase user has a real UUID and a JWT marked `is_anonymous`. NestJS stores both session tokens in HttpOnly cookies. Angular also receives the short-lived access token and keeps it only in memory so the Supabase client and Realtime connection can act as that user. Supabase client-side session persistence and auto-refresh are disabled; refresh is coordinated through NestJS.

An anonymous user must enter a display name. The `guest.resolve_requester_display_name(...)` helper validates and uses it for that membership.

### Registered user

A registered user keeps the same Supabase identity. The database ignores a caller-supplied guest name and reads the authoritative name from `public.users`. When a registered user opens an invite and has no membership yet, `restore()` can call `join_channel` automatically without showing the name form.

### What `guest.join_channel(...)` checks

The RPC derives the caller from `auth.uid()`; the browser never submits a user ID or owner flag. It locks the channel row while joining, then checks the invite, status, expiration, and `guest.channel_blocks`.

If the user has an older left or kicked membership, the RPC restores that row and keeps its member ID and LiveKit identity. A blocked membership cannot be restored. For a brand-new member, it counts active memberships and rejects the join when `max_members` is reached.

Current limit detail: `max_members` is the dashboard/channel-membership limit—25 for anonymously created rooms and 100 for registered-created rooms. The configurable maximum of 50 is a separate **LiveKit call** limit. Also, the current SQL checks `max_members` only on the brand-new-member branch; restoring an older left/kicked membership happens before that count check.

## Realtime chat

Messages are stored in `guest.messages`; individual reactions are stored in `guest.message_reactions`. Replies use `messages.reply_to`, which points to another message in the same channel.

When a user sends a message:

```text
User sends message
      -> GuestChannelStore shows a temporary optimistic message
      -> guest.create_message(...) writes to Postgres
      -> the RPC returns the saved row
      -> Supabase Realtime also emits the database change
      -> GuestChannelStore merges by row ID/client_message_id
      -> Angular signals update the chat UI
```

The store creates a UUID `client_message_id` for every send. The database has a unique retry-protection index, and the store removes any optimistic or persisted duplicate with the same row ID or client ID. This handles either the RPC response or the Realtime event arriving first.

Edits use `guest.edit_message` and set `edited_at`. Deletes use `guest.delete_message` and are soft deletes: the row remains but receives `deleted_at`, and the UI replaces its content with “This message was deleted.” Only the original sender can edit or delete through the RPC.

Reactions use `guest.toggle_message_reaction`. A reaction is uniquely identified by message, member, and emoji. The store updates its local reaction list after the RPC succeeds, then safely merges the matching Realtime insert/delete and aggregates counts by emoji. Reply creation validates that the target is a non-deleted message in the same channel.

At initial load the store fetches the channel, current member, all roster rows, all reactions, and up to 100 messages ordered oldest-first. There is currently no message pagination in `GuestChannelStore`.

One filtered Supabase Realtime channel listens for:

- updates to the current `guest.channels` row;
- all changes to this channel's `guest.channel_members`;
- all changes to this channel's `guest.messages`;
- all changes to this channel's `guest.message_reactions`.

Socket.IO is unnecessary for this feature because the database is already the source of truth and Supabase Realtime distributes its changes.

## Online and presence state: what is actually implemented

The Guest Dashboard does **not** currently use Supabase Presence and has no presence heartbeat. It also does not calculate an online roster from `last_seen_at`.

The displayed room roster is `GuestChannelStore.members`: membership rows whose `left_at` and `removed_at` are both null. The UI sometimes labels these people “currently present,” but technically it means “active membership,” not “browser currently connected.” `last_seen_at` is updated by some joins, chat/reaction activity, moderation, and leave operations, but it is not periodically refreshed and is not used to remove stale members.

This leads to the following behavior:

- Normal **Leave room** calls `guest.leave_channel`, sets `left_at`, and removes the member from active rosters through Realtime.
- Closing the tab or browser disconnects Supabase Realtime and LiveKit, but it does not call `leave_channel`. The membership can remain in the roster until the room ends or the user explicitly leaves later.
- Refreshing keeps the same membership. If the tab had joined the call, a `sessionStorage` flag makes the page request a fresh token and try to reconnect with the same LiveKit identity.
- Destroying the Angular route removes local subscriptions and call state only. It deliberately does not mutate membership.

LiveKit's participant list is accurate for who is connected to the **call**, but it is not general dashboard presence. Supabase's subscription status only tells us whether this browser is receiving database changes.

## Angular state management

`GuestChannelStore` owns persistent Guest Dashboard state. It uses Angular signals for the channel, current membership, members, messages, reactions, loading/errors, optimistic messages, and Realtime connection state.

```text
Supabase snapshot + RPC results + Realtime changes
                         -> GuestChannelStore signals
                         -> GuestRoomPage computed state
                         -> chat, roster, and room components

LiveKit SDK events       -> LiveKitCallService signals
                         -> call tiles, controls, and screen stage
```

`GuestRoomPage` coordinates page-level actions such as joining/leaving calls, polling call status, moderation confirmations, and room exit. Presentational chat/call components receive data through inputs and emit user actions; they do not know how Supabase or LiveKit persistence works.

On teardown, the page disconnects LiveKit and `GuestChannelStore.cleanup()` removes the Realtime channel and clears signals. Keeping this logic in services prevents components from each creating subscriptions, duplicating reconciliation rules, or forgetting cleanup.

## LiveKit audio

The dashboard does not connect to LiveKit during ordinary room entry. Before this browser joins the call, `GuestRoomPage` polls the protected call-status endpoint every three seconds so it can show whether a call is active and how many LiveKit participants it has.

When the user clicks **Join Call**:

```text
Angular POST /livekit/token { channelId }
    -> NestJS reads the HttpOnly access cookie
    -> SupabaseAuthGuard verifies the Supabase user
    -> CallsService verifies active membership and room expiry
    -> CallsService creates/ensures the LiveKit room with its stored capacity
    -> CallsService rejects a new identity if the call is full
    -> NestJS signs a 10-minute LiveKit token
    -> Angular connects directly to LiveKit
```

The token identity and display name come from `guest.channel_members`, not from browser input. Its grants allow joining, subscribing, and publishing microphone, screen-share video, and screen-share audio. It does not allow camera tracks, arbitrary LiveKit data messages, or room administration.

`LiveKitCallService` creates a LiveKit `Room`, enables the microphone after connection, attaches subscribed remote audio tracks to audio elements, and updates signals from participant, track, mute, active-speaker, reconnection, and disconnection events.

`livekit_identity` is the stable application identity (`member:<uuid>`). A LiveKit participant SID is a separate server-generated identifier for a particular participant connection; the current dashboard maps people using `participant.identity` and does not use the SID.

## Screen sharing

Screen sharing is media, so it uses LiveKit rather than Supabase. `LiveKitCallService.toggleScreenShare()` calls LiveKit's `setScreenShareEnabled(...)`. Other participants receive the published screen track through normal LiveKit track events, and `CallStageComponent` attaches the active publication's video track to its `<video>` element.

The service scans call participants for a screen-share publication. If it sees a remote sharer, it disables the local share button and explains who is already sharing. When the sharer stops, LiveKit sends track-unpublish/unsubscribe events, participant state refreshes, the stage detaches the track, and the button becomes available.

The “one presenter” rule is currently a client-side best-effort rule, not a database or NestJS lock. Two people starting at almost the same moment could both publish; `activeScreenShare` displays the first active share it finds. LiveKit tokens permit screen sharing for every authorized call participant.

## Member list and owner permissions

The room member panel starts from active `guest.channel_members` rows. `GuestRoomPage.roomParticipants` overlays LiveKit state by matching each row's `livekit_identity`, so it can show whether that member is in the call, speaking, muted, or sharing. The call tiles themselves use only `LiveKitCallService.participants()`.

The owner is the member referenced by `guest.channels.owner_member_id`. The current owner actions are:

- **Kick:** marks the target membership `removed_kind = 'kicked'`, optionally stores a reason, and allows the same Supabase identity to rejoin later.
- **Block:** also writes `guest.channel_blocks`; that Supabase identity cannot rejoin this channel, even with the invite code.
- **Close:** changes the channel from active to ended for everyone.

These checks are not trusted to Angular. The security-definer RPCs `guest.kick_channel_member`, `guest.block_channel_member`, and `guest.close_channel` derive the actor using `auth.uid()`, verify active ownership, reject self-moderation, and validate the target/reason.

After kick/block commits, the membership update reaches clients through Realtime. The removed browser sees its own updated row because a narrow RLS rule preserves read access to that row, then disconnects its LiveKit call. The owner's browser also calls `POST /livekit/remove-participant`; NestJS independently proves that the caller owns the room and that this owner already removed the target, then tells LiveKit to disconnect that identity and revoke the current token.

Therefore, bypassing the Angular buttons does not grant moderation authority: the database and NestJS repeat the important checks.

## RLS and security

Row Level Security (RLS) limits what the browser's Supabase identity may read. Active members can select their room's channel, membership, message, and reaction rows; removed users retain only the special access needed to receive/read their own membership result. `guest.channel_blocks` is not browser-readable.

Browser roles have `SELECT` but no direct table-write grants. Mutations go through security-definer RPCs, which validate `auth.uid()`, membership, ownership, room state, and payload rules. Anonymous Auth users have `auth.uid()` and use Supabase's authenticated database role, so they are covered by the same RLS/RPC rules as registered users.

NestJS keeps the Supabase admin/service credential and LiveKit API secret server-side. The browser gets only the public Supabase key plus its own short-lived JWT, and LiveKit receives a restricted per-member token.

The invite is possession-based: there is no separate room password. A valid authenticated Supabase identity with the code can join unless the room is expired, ended, full for new memberships, or that identity is blocked.

## Limits, expiration, and cleanup

There are two independent capacities:

| Limit               | Current behavior                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Channel memberships | `guest.channels.max_members`: 25 for anonymous-created rooms, 100 for registered-created rooms. Not configurable in the UI. Checked by `join_channel` for a new member while the channel row is locked.                               |
| Call participants   | `guest.channels.max_call_participants`: default 8, configurable by registered creators from 2 to 50. NestJS checks current LiveKit participants and creates the LiveKit room with this limit; LiveKit is the final enforcement layer. |

Expiration is stored in `guest.channels.expires_at`. Anonymous rooms default to 60 minutes. Registered creators may choose up to 180 minutes (3 hours). Join, chat creation, moderation, and call authorization reject inactive/expired rooms even if the scheduled cleanup has not run yet; Angular also compares `expires_at` locally and exits the ready state.

Database cleanup uses `pg_cron`:

- Every 5 minutes, `guest.expire_due_channels(15)` ends rooms past `expires_at`, and rooms marked empty for 15 minutes after all members explicitly leave.
- Every 15 minutes, `guest.purge_ended_channels(60)` permanently deletes rooms ended for at least 60 minutes. Foreign-key cascades remove memberships, messages, reactions, and blocks.
- Daily at 03:20 UTC, `guest.cleanup_stale_anonymous_users('7 days', 1000)` deletes old anonymous Auth users only when they have no remaining membership rows.

This delayed cleanup keeps temporary data from growing forever while leaving a short operational window after a room ends. A browser disappearing without explicit leave does not trigger the empty-room timer, but the hard `expires_at` limit still does.

## Why these technologies and decisions?

- **Angular:** renders the dashboard and turns signals from the store and LiveKit service into reactive chat/call UI.
- **NestJS:** owns cookie-based session restoration, registered-only room configuration, privileged moderation cleanup, and LiveKit token signing. Secrets and trusted authorization stay off the client.
- **Supabase:** provides the Postgres source of truth, anonymous/registered identity, RLS, RPC transactions, and Realtime delivery for guest data.
- **LiveKit:** handles low-latency audio, screen tracks, participant media presence, reconnection, and capacity without building a custom WebRTC/SFU stack.
- **Monorepo and shared Zod contracts:** Angular and NestJS use the same REST payload rules and shared product limits. Generated Supabase types describe the guest database rows.
- **Separate `guest` schema:** temporary room data and its RLS/RPC surface stay isolated from the registered application's public-schema features.
- **No Socket.IO for guest chat:** Supabase Realtime already broadcasts changes from the database source of truth, so another event path would create duplication and reconciliation risk.
- **No automatic LiveKit join:** chat-only members should not need media permission or take call capacity.

## Questions Mentors Might Ask

### 1. What talks to what in the Guest Dashboard?

Angular uses NestJS for auth and protected LiveKit/configuration operations, Supabase directly for guest data and Realtime, and LiveKit directly for media. NestJS never transports chat events or media.

### 2. Why Angular?

Angular owns the interactive page and reactive UI state. Signals let the chat, member list, call controls, and status labels update when store or LiveKit state changes.

### 3. Why NestJS if Angular can call Supabase?

NestJS is needed where secrets or extra trust are required: restoring sessions through HttpOnly cookies, restricting advanced room creation, checking privileged call actions, and signing LiveKit tokens. Normal guest chat can remain user-scoped under Supabase RLS.

### 4. Why Supabase?

It combines Supabase Auth, Postgres, RLS, transactional RPC functions, and database-change Realtime. That makes the saved rows the source of truth for both initial load and live chat updates.

### 5. Why LiveKit?

Audio and screen sharing need media routing, subscriptions, device handling, and reconnection. LiveKit supplies that SFU/media layer while NestJS only authorizes access.

### 6. Why a monorepo and a separate guest schema?

The monorepo makes shared Zod contracts and limits available to Angular and NestJS. The `guest` schema isolates temporary-room tables, RPCs, RLS rules, and cleanup from registered application data.

### 7. How can a guest be authenticated without registering?

Supabase Anonymous Auth creates a real `auth.users` identity and session without email/password. The JWT is marked anonymous, but it still has `auth.uid()` and participates in RLS like an authenticated identity.

### 8. How do we distinguish anonymous and registered users?

Angular uses `user.isAnonymous`; the database reads the JWT's `is_anonymous` claim. Anonymous users choose a room display name, while registered users get the name from `public.users`.

### 9. How does realtime chat work?

An RPC saves the message in Postgres, and Supabase Realtime emits the row change. `GuestChannelStore` merges it into signals, which causes Angular to render the update.

### 10. Why is Socket.IO not used?

Supabase Realtime already distributes changes from the same database that persists the chat. A second guest-chat transport would add duplicate events and another state-reconciliation path.

### 11. What if two users send at the same time?

Postgres stores both as separate UUID rows. The store orders messages by `created_at` and then ID; per-send `client_message_id` values prevent retries from duplicating a sender's message.

### 12. How do replies, edits, deletes, and reactions stay consistent?

Replies store the target UUID. Edits and soft deletes update the same message row, while reactions have a unique message/member/emoji key; all corresponding database changes arrive through the same Realtime subscription.

### 13. How do we know who is online?

Currently, we do not maintain true dashboard presence. The room list shows active membership rows, while LiveKit accurately shows only who is connected to the call; Supabase Presence and a heartbeat are not implemented.

### 14. What happens if someone closes the browser?

Realtime and LiveKit disconnect, but the channel membership is not automatically left. The member may remain in the room roster until explicit leave, later re-entry/leave, or room expiration and purge.

### 15. What is the difference between a member and a call participant?

A member has joined the Guest Channel and can chat. A call participant is a member who also requested a token and is currently connected to the LiveKit room.

### 16. When does Lobby connect to LiveKit?

Only after **Join Call**, or after a same-tab refresh when `sessionStorage` says this membership was already in the call. Ordinary invite entry loads Supabase data and Realtime without connecting to media.

### 17. Why not use the display name as the LiveKit identity?

Names can collide or change. `member:<membership-uuid>` is stable and unique, while the name remains separate presentation metadata; LiveKit's participant SID is another connection-level identifier and is not used for mapping here.

### 18. What happens when someone leaves the call but stays in the room?

LiveKit removes that participant and its media tracks, but the `channel_members` row remains active. The user can continue chatting and join the call again later.

### 19. How does screen sharing work, and is one sharer guaranteed?

The browser publishes a LiveKit screen track and other browsers attach it to the call stage. The UI disables sharing when it observes another sharer, but this is client-side best effort; simultaneous starts are not prevented by a server lock.

### 20. What prevents joining an invalid, expired, full, or blocked room?

`guest.join_channel` locks and validates the channel, checks status/expiry and `guest.channel_blocks`, and checks `max_members` for new memberships. A code acts as the invite secret; there is no separate password.

### 21. Can someone bypass the frontend and kick another member?

No ordinary member can gain authority by calling the RPC directly. The moderation RPC derives the actor from `auth.uid()` and verifies that their active member ID equals `owner_member_id`; NestJS independently verifies owner/removal state before disconnecting LiveKit media.

### 22. What is RLS, and why use RPC functions?

RLS filters browser reads according to the current Supabase identity. RPCs provide a narrow mutation surface where multi-row operations, validation, ownership, capacity, and `auth.uid()` checks happen transactionally without granting direct table writes.

### 23. Why do we need `guest.channel_members` and `livekit_identity`?

The membership row connects one Supabase user to one room-specific display name, owner/member status, leave/removal history, and stable media identity. LiveKit identity lets the UI match that stored member with a current media participant.

### 24. How do the 50-user maximum, expiration, and deletion work?

Fifty is the maximum configurable **call** capacity, not the dashboard membership limit. `expires_at` is at most three hours, operations reject expired rooms immediately, cron marks them ended, and a later cron permanently deletes their related data.
