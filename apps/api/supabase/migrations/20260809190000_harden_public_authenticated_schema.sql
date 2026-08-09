begin;

-- The previous removed_at default matched joined_at, marking every new
-- membership as removed immediately. Repair only rows that still carry that
-- exact default-produced value and have no explicit leave timestamp.
update public.channel_members
set removed_at = null
where left_at is null
  and removed_at = joined_at;

alter table public.channel_members
  alter column removed_at drop default;

alter table public.channel_members
  add constraint channel_members_channel_id_user_id_key
  unique (channel_id, user_id);

-- Preflight verified that all existing channels have both ownership fields.
alter table public.channels
  alter column server_id set not null,
  alter column created_by set not null;

-- Preflight verified that every existing value is a valid UUID and references
-- an existing channel.
alter table public.messages
  alter column channel_id type uuid using channel_id::uuid;

alter table public.messages
  add constraint messages_channel_id_fkey
  foreign key (channel_id)
  references public.channels(id)
  on update cascade
  on delete cascade;

alter table public.notifications
  add constraint notifications_channel_id_fkey
  foreign key (channel_id)
  references public.channels(id)
  on update cascade
  on delete cascade;

-- Deleting a replied-to message should preserve the reply and clear only its
-- optional pointer to the deleted parent.
alter table public.messages
  drop constraint messages_reply_to_fkey,
  add constraint messages_reply_to_fkey
  foreign key (reply_to)
  references public.messages(id)
  on update cascade
  on delete set null;

alter table public.dm_messages
  drop constraint dm_messages_reply_to_fkey,
  add constraint dm_messages_reply_to_fkey
  foreign key (reply_to)
  references public.dm_messages(id)
  on update cascade
  on delete set null;

-- Cover foreign-key lookups and the current notification feed query.
create index channel_members_user_id_idx
  on public.channel_members(user_id);
create index channels_created_by_idx
  on public.channels(created_by);
create index dm_messages_sender_id_idx
  on public.dm_messages(sender_id);
create index dm_messages_reply_to_idx
  on public.dm_messages(reply_to);
create index friendships_blocked_by_idx
  on public.friendships(blocked_by);
create index messages_reply_to_idx
  on public.messages(reply_to);
create index notifications_channel_id_idx
  on public.notifications(channel_id);
create index notifications_message_id_idx
  on public.notifications(message_id);
create index notifications_server_id_idx
  on public.notifications(server_id);
create index notifications_user_created_at_idx
  on public.notifications(user_id, created_at desc);

-- NestJS is the write authority for authenticated dashboard data. Retain only
-- the direct reads currently required for browser Realtime subscriptions.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on table
  public.dm_conversations,
  public.dm_messages,
  public.notifications
to authenticated;

-- Direct account_settings mutations must not become available again through
-- an accidental table grant. Keep the owner-scoped SELECT policy only.
drop policy if exists "Users can delete their own account settings"
  on public.account_settings;
drop policy if exists "Users can insert their own account settings"
  on public.account_settings;
drop policy if exists "Users can update their own account settings"
  on public.account_settings;

-- Secure future public objects as well as the existing ones. Service-role and
-- owner privileges are intentionally unchanged.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
