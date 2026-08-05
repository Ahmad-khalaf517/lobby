-- =====================================================================
-- Lobby · Supabase schema (schema)
-- Run this top-to-bottom in the Supabase SQL Editor (or via `supabase db
-- push`) on an empty database. Tables are ordered so every foreign key
-- points at a table that already exists by the time it's declared —
-- running this file start to finish should not error.
--
-- All objects live in the `schema` schema (not `public`) — see the
-- `create schema` statement below. Every reference is schema-qualified
-- (`schema.<table>`) so nothing depends on search_path.
--
-- SECURITY MODEL (read this before changing anything):
-- This app has no user authentication — a display name and a room link
-- are the only "identity". That means there is no authenticated Supabase
-- user to write RLS policies against, so the safe pattern is:
--
--   * RLS is ENABLED on every table
--   * NO public policies are granted (anon/authenticated roles get nothing)
--   * apps/api connects with the SERVICE_ROLE key, which bypasses RLS
--   * apps/web NEVER talks to Supabase directly — all DB access goes
--     through NestJS, which enforces "do you know the channel id?"
--
-- Do NOT put the service_role key in the Angular app or any client-side
-- env file. It bypasses every policy below. It belongs only in the
-- NestJS server environment.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Extensions — gen_random_uuid() needs pgcrypto. Supabase projects have
-- this on by default, but declaring it here keeps the file runnable on
-- a plain Postgres instance too.
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------
create schema if not exists schema;


-- ---------------------------------------------------------------------
-- Shared trigger function — bumps updated_at on any row update.
-- Declared once, up top, since user_profiles/account_settings/
-- message_reactions below all use it.
-- ---------------------------------------------------------------------
create or replace function schema.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- users
-- No dependencies — created first so servers/channel_members can
-- reference it inline instead of needing a deferred ALTER.
-- ---------------------------------------------------------------------
create table if not exists schema.users (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(40) not null,
  created_at timestamptz not null default now()
);

comment on table schema.users is 'Authenticated-path identities (Phase 2). No auth mechanism is wired up in apps/api yet — this table alone does not enable login.';


-- ---------------------------------------------------------------------
-- servers
-- ---------------------------------------------------------------------
create table if not exists schema.servers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references schema.users(id) on delete cascade,
  name        varchar(100) not null,
  -- the shareable join code, same convention as channels.id: knowing it
  -- is the access control, no separate invitations table.
  invite_code varchar(12) not null,
  created_at  timestamptz not null default now()
);

comment on table  schema.servers             is 'A Discord-style server owned by one authenticated user.';
comment on column schema.servers.invite_code is 'Shareable join code. Redeeming it is an app-level action that inserts a server_members row.';

create index if not exists servers_owner_id_idx
  on schema.servers (owner_id);

create unique index if not exists servers_invite_code_idx
  on schema.servers (invite_code);


-- ---------------------------------------------------------------------
-- server_members — who belongs to a server. Membership is what makes
-- "persistent room membership" persistent: a member can return to a
-- server (and whatever it grants access to) any time.
-- ---------------------------------------------------------------------
create table if not exists schema.server_members (
  id        uuid primary key default gen_random_uuid(),
  server_id uuid not null references schema.servers(id) on delete cascade,
  user_id   uuid not null references schema.users(id) on delete cascade,
  role      varchar(20) not null default 'member',
  joined_at timestamptz not null default now()
);

comment on table schema.server_members is 'Join table: which authenticated users belong to which servers.';

create index if not exists server_members_user_id_idx
  on schema.server_members (user_id);

create unique index if not exists server_members_server_user_idx
  on schema.server_members (server_id, user_id);


-- ---------------------------------------------------------------------
-- channels
-- server_id null = standalone guest channel (no server). Set only for
-- authenticated/server-owned channels — see docs/PROJECT_PLAN.md §2.
-- ---------------------------------------------------------------------
create table if not exists schema.channels (
  -- nanoid generated by NestJS, not a uuid — it's the shareable room code
  id                  text primary key,
  server_id           uuid references schema.servers(id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 60),
  -- stable LiveKit room identifier for voice call join; set by apps/api
  -- when the channel is created (or lazily on first call start).
  livekit_room_name   text,
  -- soft participant cap enforced by the call-token endpoint, not Postgres
  max_participants    integer not null default 8,
  created_at          timestamptz not null default now(),
  -- rooms expire automatically; null means "no expiry"
  expires_at          timestamptz,
  unique (server_id, name)
);

comment on table  schema.channels                   is 'A channel inside a server, or a standalone guest channel when server_id is null.';
comment on column schema.channels.id                is 'nanoid from NestJS (e.g. LBY-7X3Q) — used directly in the invite link.';
comment on column schema.channels.server_id         is 'Parent server that owns this channel. Null for guest channels created without a server.';
comment on column schema.channels.name              is 'Channel display name, unique within a server (guest channels are exempt — server_id null means every row counts as a distinct unique-constraint entry).';
comment on column schema.channels.livekit_room_name is 'Stable LiveKit room identifier for voice call join.';
comment on column schema.channels.max_participants  is 'Soft channel participant cap enforced by the backend token endpoint.';
comment on column schema.channels.expires_at        is 'When the room and its messages should be considered dead. Null = never.';

create index if not exists channels_server_id_idx
  on schema.channels (server_id);

create index if not exists channels_created_at_idx
  on schema.channels (created_at);

create index if not exists channels_expires_at_idx
  on schema.channels (expires_at)
  where expires_at is not null;


-- ---------------------------------------------------------------------
-- channel_members
-- One row per join (guest or authenticated), never deleted — see
-- left_at below.
-- ---------------------------------------------------------------------
create table if not exists schema.channel_members (
  id               uuid primary key default gen_random_uuid(),
  channel_id       text not null references schema.channels(id) on delete cascade,
  -- set for an authenticated member; null for a guest. Exactly one of
  -- user_id / guest_name is set.
  user_id          uuid references schema.users(id) on delete set null,
  guest_name       varchar(40),
  role             varchar(20) not null default 'member',
  -- reserved for the LiveKit call-token endpoint (BE-2) to bind a stable
  -- participant identity to this membership.
  livekit_identity varchar(150) not null,
  joined_at        timestamptz not null default now(),
  -- null while still connected; set on explicit leave or disconnect.
  -- Rows are never deleted so past messages keep a resolvable author.
  left_at          timestamptz
);

comment on table  schema.channel_members                  is 'One row per channel join. Never deleted — see left_at. messages.sender_id references this, not a free-text name.';
comment on column schema.channel_members.left_at          is 'Null while connected. Set (not deleted) on leave/disconnect so past messages still resolve an author.';
comment on column schema.channel_members.livekit_identity is 'Reserved for the future LiveKit call-token endpoint; unused by chat itself.';

create index if not exists channel_members_channel_id_idx
  on schema.channel_members (channel_id);

-- A guest rejoining under the same name (refresh, reconnect, or simply two
-- people picking the same display name) reactivates this row rather than
-- getting a duplicate — apps/api's openChannelMember does a
-- look-up-then-write specifically because of this constraint.
create unique index if not exists unique_channel_guest
  on schema.channel_members (channel_id, lower(guest_name));


-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
create table if not exists schema.messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  text not null references schema.channels(id) on delete cascade,
  sender_id   uuid not null references schema.channel_members(id),
  content     text not null check (char_length(content) between 1 and 2000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

comment on table  schema.messages           is 'Chat messages. Deleted automatically when the parent channel is deleted.';
comment on column schema.messages.sender_id is 'The channel_members row that sent this — join it to resolve a display name (guest_name, or the sender''s user).';

-- The only query the app makes: "messages for this channel, oldest first"
create index if not exists messages_channel_created_idx
  on schema.messages (channel_id, created_at);


-- ---------------------------------------------------------------------
-- message_reactions
-- One reaction per member per message. A member can change their
-- reaction, which updates the same row instead of inserting duplicates.
-- ---------------------------------------------------------------------
create table if not exists schema.message_reactions (
  id                 uuid primary key default gen_random_uuid(),
  message_id         uuid not null references schema.messages(id) on delete cascade,
  channel_member_id  uuid not null references schema.channel_members(id) on delete cascade,
  emoji              varchar(16) not null check (char_length(emoji) between 1 and 16),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table schema.message_reactions is 'Emoji reactions for chat messages. One row per (message, member).';
comment on column schema.message_reactions.channel_member_id is 'Who reacted, via channel_members.id.';

create unique index if not exists message_reactions_message_member_idx
  on schema.message_reactions (message_id, channel_member_id);

create index if not exists message_reactions_message_id_idx
  on schema.message_reactions (message_id);

create index if not exists message_reactions_channel_member_id_idx
  on schema.message_reactions (channel_member_id);

drop trigger if exists message_reactions_set_updated_at on schema.message_reactions;
create trigger message_reactions_set_updated_at
before update on schema.message_reactions
for each row
execute function schema.set_updated_at_timestamp();


-- ---------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------
create table if not exists schema.user_profiles (
  user_id      text primary key,
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio          text check (char_length(bio) <= 280),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table schema.user_profiles is 'User profile records for authenticated account flows.';
comment on column schema.user_profiles.user_id is 'Stable account identifier used by app-level profile routes.';

drop trigger if exists user_profiles_set_updated_at on schema.user_profiles;
create trigger user_profiles_set_updated_at
before update on schema.user_profiles
for each row
execute function schema.set_updated_at_timestamp();


-- ---------------------------------------------------------------------
-- account_settings
-- ---------------------------------------------------------------------
create table if not exists schema.account_settings (
  user_id                      text primary key,
  email_notifications_enabled boolean not null default true,
  push_notifications_enabled  boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

comment on table schema.account_settings is 'Account settings persisted for backend account-management flows.';

drop trigger if exists account_settings_set_updated_at on schema.account_settings;
create trigger account_settings_set_updated_at
before update on schema.account_settings
for each row
execute function schema.set_updated_at_timestamp();


-- ---------------------------------------------------------------------
-- friendships
-- One row per relationship pair (undirected — see the unique index
-- below), covering friend requests, accepted friendships, and blocks
-- in a single lifecycle rather than three separate tables.
--
-- requester_id/addressee_id record who *sent the original request*;
-- blocked_by records who *performed the block*, which is not always
-- the same person — e.g. A requests B, then B blocks A: requester_id
-- is still A, but blocked_by is B. Querying "who blocked me" or "who
-- did I block" should always filter on blocked_by, never assume it's
-- the requester.
-- ---------------------------------------------------------------------
create table if not exists schema.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references schema.users(id) on delete cascade,
  addressee_id uuid not null references schema.users(id) on delete cascade,
  status       varchar(20) not null default 'pending'
               check (status in ('pending', 'accepted', 'blocked')),
  -- who performed the block; required when status = 'blocked', null otherwise.
  blocked_by   uuid references schema.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (requester_id <> addressee_id),
  check (status <> 'blocked' or blocked_by is not null),
  check (blocked_by is null or blocked_by in (requester_id, addressee_id))
);

comment on table  schema.friendships             is 'Friend requests, accepted friendships, and blocks — one row per user pair, status tracks the current relationship state.';
comment on column schema.friendships.requester_id is 'Who sent the original friend request. Fixed at row creation, does not change on accept/block.';
comment on column schema.friendships.addressee_id is 'Who received the original friend request.';
comment on column schema.friendships.status       is 'pending = request awaiting response; accepted = mutual friends; blocked = see blocked_by for direction.';
comment on column schema.friendships.blocked_by   is 'Who performed the block (requester_id or addressee_id) — the block''s direction is independent of who originally sent the friend request.';

-- One relationship row per pair regardless of direction — prevents a
-- duplicate/reverse-duplicate row if both users somehow request each
-- other at once. Comparing uuids with least/greatest gives a stable,
-- order-independent pair key.
create unique index if not exists friendships_pair_idx
  on schema.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- "My incoming pending requests" / "my outgoing pending requests" are
-- the two hottest queries this table serves.
create index if not exists friendships_addressee_status_idx
  on schema.friendships (addressee_id, status);

create index if not exists friendships_requester_status_idx
  on schema.friendships (requester_id, status);

drop trigger if exists friendships_set_updated_at on schema.friendships;
create trigger friendships_set_updated_at
before update on schema.friendships
for each row
execute function schema.set_updated_at_timestamp();


-- ---------------------------------------------------------------------
-- Row Level Security
-- Enabled with no policies: anon and authenticated roles can do nothing.
-- apps/api uses the service_role key and bypasses this entirely.
-- ---------------------------------------------------------------------
alter table schema.users            enable row level security;
alter table schema.servers          enable row level security;
alter table schema.server_members   enable row level security;
alter table schema.channels         enable row level security;
alter table schema.channel_members  enable row level security;
alter table schema.messages         enable row level security;
alter table schema.message_reactions enable row level security;
alter table schema.user_profiles    enable row level security;
alter table schema.account_settings enable row level security;
alter table schema.friendships      enable row level security;


-- ---------------------------------------------------------------------
-- Optional: expired-room cleanup
-- Call this from a Supabase scheduled job, or just run it manually.
-- Messages go with the channel via the on delete cascade above.
-- ---------------------------------------------------------------------
create or replace function schema.delete_expired_channels()
returns void
language sql
security definer
set search_path = schema
as $$
  delete from schema.channels
  where expires_at is not null
    and expires_at < now();
$$;
