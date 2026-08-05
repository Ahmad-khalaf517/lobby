# Feature List

Full catalog of features under consideration for Lobby, grouped by area. This is a scope
reference, not a status tracker — for priority tiers, implementation status, branch names, and
ownership, see `docs/PROJECT_PLAN.md` Section 2.

---

## Identity & Entry

- Enter a display name to join as guest (no account needed)
- Guest session ID stored in a cookie
- Register for an account
- Log in
- Forgot/reset password
- View and edit user profile (one identity — same name across all servers, no per-server nicknames)
- Manage account settings
- Adjust app settings (theme, notifications, etc.)

## Channels

- **Guest channels:** any guest (no account) can create a channel and invite others by sharing the
  link — temporary, auto-expires after a set time (e.g. 1 hour), and stands alone (not part of any
  server)
- **Authenticated channels:** channels created by logged-in users live inside a server, and can be
  permanent or expiring
- Join a channel via link
- Rename/update a channel
- Delete a channel
- Channels + full chat history persist across restarts (until expired/deleted)
- Duplicate channel names are fine — no collision handling needed, IDs stay unique

## Chat

- Real-time text messaging in a channel
- Typing indicator
- Message timestamps + grouping by sender
- Edit a message
- Delete a message
- Message threads
- Emoji reactions on messages
- Read state / unread badges

## Presence & Membership

- Member list — who's in the channel, with online/offline status visible
- Join/leave notifications
- Persistent room membership (rejoin permanent rooms any time)

## Voice & Video

- Create a voice channel; any member can start a call in it
- Other members see a "Join call" button + a short notification ping when a call starts (no
  ringtone)
- Reconnect handling
- Mute/unmute toggle
- Screen sharing

## Servers & Dashboard

- Dashboard (landing page after login) — shows the authenticated user's servers and permanent
  channels; guests don't have this, just their temporary channel(s)
- Create server
- Switch server
- Server icon / branding
- Server welcome screen
- Invite users to a server
- Server members list

## Social

- Friends list, friend requests, blocking
- Direct messages (DMs)

## UI/Platform

- Channel UI shell (chat + member list + call controls)
- Copy-link button + toast
- Responsive design
- Dark mode

## Security

- Short-lived, per-channel LiveKit call tokens
- Server-side-generated unguessable channel IDs
- Service-role DB key never exposed to the browser

## Moderation

_(last, lowest priority)_

- Kick / ban / timeout members

---

## Relationship to current scope

Most of the above tracks the High/Medium/Low tiers already defined in `docs/PROJECT_PLAN.md`
Section 2. The following areas are **not yet represented in PROJECT_PLAN.md** and have no
priority, owner, or hour estimate assigned:

- Message threads
- Read state / unread badges
- Server icon / branding
- Server welcome screen
- Server members list
- Social: friends list, friend requests, blocking, DMs
- Moderation: kick / ban / timeout

Note also that `CLAUDE.md`'s "no authentication system" restriction is scoped to the current
no-auth guest flow; PROJECT_PLAN.md already flags that it needs an explicit update before any
account-system work (register/login/dashboard/servers) begins. The Social and Moderation
categories above extend further still — they assume authenticated, persistent user identities
(friends, blocks, DMs, per-server moderation roles), which is a larger step past today's link-join
model and would need its own scoping pass before estimation.
