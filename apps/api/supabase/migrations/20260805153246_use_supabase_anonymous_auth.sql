-- Switch guest channels from custom session-token identities to Supabase Auth.
-- Both anonymous and permanent users are represented by auth.uid().
--
-- IMPORTANT:
-- Legacy token-only channel memberships cannot be converted into Supabase anonymous
-- users because no auth.users row exists for them. This migration removes only
-- channels that still contain at least one legacy token-only member.

-- -----------------------------------------------------------------------------
-- 1. Remove the old RPC overloads before changing the membership model.
-- -----------------------------------------------------------------------------

drop function if exists guest.create_channel(text, text, text, uuid, integer, integer);
drop function if exists guest.join_channel(text, text, text, uuid);
drop function if exists guest.create_message(uuid, uuid, text, uuid, guest.message_type, uuid);
drop function if exists guest.edit_message(uuid, uuid, uuid, text);
drop function if exists guest.delete_message(uuid, uuid, uuid);
drop function if exists guest.toggle_message_reaction(uuid, uuid, uuid, text);
drop function if exists guest.leave_channel(uuid, uuid);
drop function if exists guest.close_channel(uuid, uuid);
drop function if exists guest.validate_member_input(text, uuid, text);

-- -----------------------------------------------------------------------------
-- 2. Remove data that cannot be migrated from custom tokens to auth.users.
-- -----------------------------------------------------------------------------

delete from guest.channels as c
where exists (
  select 1
  from guest.channel_members as cm
  where cm.channel_id = c.id
    and cm.user_id is null
);

-- -----------------------------------------------------------------------------
-- 3. Simplify channel_members: every member now has an auth.users identity.
-- -----------------------------------------------------------------------------

drop index if exists guest.guest_channel_members_session_token_hash_key;
drop index if exists guest.guest_channel_members_active_user_key;

alter table guest.channel_members
  drop constraint if exists guest_channel_members_identity_check,
  drop constraint if exists guest_channel_members_session_hash_check;

alter table guest.channel_members
  drop column if exists session_token_hash,
  drop column if exists kind;

alter table guest.channel_members
  alter column user_id set not null;

-- One active membership per Supabase user per channel.
-- Duplicate display names remain allowed.
create unique index guest_channel_members_active_user_key
  on guest.channel_members(channel_id, user_id)
  where left_at is null
    and removed_at is null;

-- The enum is no longer needed after dropping channel_members.kind.
drop type if exists guest.member_kind;

-- -----------------------------------------------------------------------------
-- 4. Internal helpers. These use the caller's Supabase JWT via auth.uid()/jwt().
-- -----------------------------------------------------------------------------

create or replace function guest.requester_is_anonymous()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
$$;

create or replace function guest.resolve_requester_display_name(
  p_requested_display_name text default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
  v_is_anonymous boolean;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required.';
  end if;

  v_is_anonymous := guest.requester_is_anonymous();

  if v_is_anonymous then
    v_display_name := pg_catalog.btrim(p_requested_display_name);

    if v_display_name is null
      or pg_catalog.char_length(v_display_name) not between 1 and 40
      or v_display_name ~ '[[:cntrl:]]'
    then
      raise exception using
        errcode = '22023',
        message = 'Anonymous users must provide a display name containing 1 to 40 visible characters.';
    end if;

    return v_display_name;
  end if;

  -- Registered users do not control the name passed to the guest-channel RPC.
  -- Adjust public.users/name here if your profile table uses a different name.
  select pg_catalog.btrim(u.name)
  into v_display_name
  from public.users as u
  where u.id = v_user_id;

  if v_display_name is null
    or pg_catalog.char_length(v_display_name) not between 1 and 40
    or v_display_name ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = 'P0002',
      message = 'The authenticated user profile or display name was not found.';
  end if;

  return v_display_name;
end;
$$;

create or replace function guest.current_member_id(p_channel_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.id
  from guest.channel_members as cm
  where cm.channel_id = p_channel_id
    and cm.user_id = auth.uid()
    and cm.left_at is null
    and cm.removed_at is null
  order by cm.created_at desc
  limit 1;
$$;

create or replace function guest.is_active_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from guest.channel_members as cm
    where cm.channel_id = p_channel_id
      and cm.user_id = auth.uid()
      and cm.left_at is null
      and cm.removed_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- 5. Public guest-channel RPCs. Identity is always derived from auth.uid().
-- -----------------------------------------------------------------------------

create function guest.create_channel(
  p_name text,
  p_display_name text default null,
  p_max_members integer default 25,
  p_lifetime_minutes integer default 60
)
returns table (
  channel_id uuid,
  member_id uuid,
  code text,
  livekit_room_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
  v_channel_id uuid := gen_random_uuid();
  v_owner_member_id uuid := gen_random_uuid();
  v_code text;
  v_livekit_room_name text;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  v_display_name := guest.resolve_requester_display_name(p_display_name);

  if p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 80
    or pg_catalog.btrim(p_name) ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'Channel name must contain 1 to 80 visible characters.';
  end if;

  if p_max_members is null or p_max_members not between 2 and 100 then
    raise exception using
      errcode = '22023',
      message = 'max_members must be between 2 and 100.';
  end if;

  if p_lifetime_minutes is null or p_lifetime_minutes not between 5 and 1440 then
    raise exception using
      errcode = '22023',
      message = 'lifetime_minutes must be between 5 and 1440.';
  end if;

  v_code := guest.generate_channel_code();
  v_livekit_room_name := 'guest-' || v_channel_id::text;
  v_expires_at := pg_catalog.now() + pg_catalog.make_interval(mins => p_lifetime_minutes);

  insert into guest.channels (
    id,
    code,
    name,
    owner_member_id,
    livekit_room_name,
    max_members,
    expires_at
  )
  values (
    v_channel_id,
    v_code,
    pg_catalog.btrim(p_name),
    v_owner_member_id,
    v_livekit_room_name,
    p_max_members,
    v_expires_at
  );

  insert into guest.channel_members (
    id,
    channel_id,
    user_id,
    display_name,
    livekit_identity
  )
  values (
    v_owner_member_id,
    v_channel_id,
    v_user_id,
    v_display_name,
    'member:' || v_owner_member_id::text
  );

  return query
  select
    v_channel_id,
    v_owner_member_id,
    v_code,
    v_livekit_room_name,
    v_expires_at;
end;
$$;

create function guest.join_channel(
  p_code text,
  p_display_name text default null
)
returns table (
  channel_id uuid,
  member_id uuid,
  livekit_room_name text,
  expires_at timestamptz,
  rejoined boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
  v_channel guest.channels%rowtype;
  v_member guest.channel_members%rowtype;
  v_member_id uuid;
  v_active_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  v_display_name := guest.resolve_requester_display_name(p_display_name);

  select c.*
  into v_channel
  from guest.channels as c
  where c.code = pg_catalog.upper(pg_catalog.btrim(p_code))
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Guest channel was not found.';
  end if;

  if v_channel.status <> 'active' or v_channel.expires_at <= pg_catalog.now() then
    raise exception using
      errcode = '55000',
      message = 'Guest channel is no longer active.';
  end if;

  select cm.*
  into v_member
  from guest.channel_members as cm
  where cm.channel_id = v_channel.id
    and cm.user_id = v_user_id
  order by cm.created_at desc
  limit 1;

  if found then
    if v_member.removed_at is not null then
      raise exception using
        errcode = '42501',
        message = 'This member was removed from the channel.';
    end if;

    update guest.channel_members
    set
      display_name = v_display_name,
      left_at = null,
      last_joined_at = pg_catalog.now(),
      last_seen_at = pg_catalog.now()
    where id = v_member.id;

    update guest.channels
    set
      empty_since = null,
      last_activity_at = pg_catalog.now()
    where id = v_channel.id;

    return query
    select
      v_channel.id,
      v_member.id,
      v_channel.livekit_room_name,
      v_channel.expires_at,
      true;

    return;
  end if;

  select count(*)
  into v_active_count
  from guest.channel_members as cm
  where cm.channel_id = v_channel.id
    and cm.left_at is null
    and cm.removed_at is null;

  if v_active_count >= v_channel.max_members then
    raise exception using
      errcode = '54000',
      message = 'Guest channel has reached its participant limit.';
  end if;

  v_member_id := gen_random_uuid();

  insert into guest.channel_members (
    id,
    channel_id,
    user_id,
    display_name,
    livekit_identity
  )
  values (
    v_member_id,
    v_channel.id,
    v_user_id,
    v_display_name,
    'member:' || v_member_id::text
  );

  update guest.channels
  set
    empty_since = null,
    last_activity_at = pg_catalog.now()
  where id = v_channel.id;

  return query
  select
    v_channel.id,
    v_member_id,
    v_channel.livekit_room_name,
    v_channel.expires_at,
    false;
end;
$$;

create function guest.create_message(
  p_channel_id uuid,
  p_content text,
  p_reply_to uuid default null,
  p_type guest.message_type default 'text',
  p_client_message_id uuid default null
)
returns guest.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_message guest.messages%rowtype;
begin
  v_member_id := guest.current_member_id(p_channel_id);

  if v_member_id is null then
    raise exception using
      errcode = '42501',
      message = 'The current user is not an active member of this channel.';
  end if;

  if not exists (
    select 1
    from guest.channels as c
    where c.id = p_channel_id
      and c.status = 'active'
      and c.expires_at > pg_catalog.now()
  ) then
    raise exception using
      errcode = '55000',
      message = 'Guest channel is no longer active.';
  end if;

  if p_type is null or p_type = 'system' then
    raise exception using
      errcode = '22023',
      message = 'System messages cannot be created through create_message.';
  end if;

  if p_content is null
    or pg_catalog.char_length(p_content) not between 1 and 4000
    or p_content ~ '^[[:space:]]*$'
  then
    raise exception using
      errcode = '22023',
      message = 'Message content must contain 1 to 4000 characters.';
  end if;

  if p_reply_to is not null
    and not exists (
      select 1
      from guest.messages as m
      where m.id = p_reply_to
        and m.channel_id = p_channel_id
        and m.deleted_at is null
    )
  then
    raise exception using
      errcode = '23503',
      message = 'The reply target does not exist in this channel.';
  end if;

  if p_client_message_id is not null then
    select m.*
    into v_message
    from guest.messages as m
    where m.channel_id = p_channel_id
      and m.sender_member_id = v_member_id
      and m.client_message_id = p_client_message_id;

    if found then
      return v_message;
    end if;
  end if;

  insert into guest.messages (
    channel_id,
    sender_member_id,
    type,
    content,
    client_message_id,
    reply_to
  )
  values (
    p_channel_id,
    v_member_id,
    p_type,
    p_content,
    p_client_message_id,
    p_reply_to
  )
  returning * into v_message;

  update guest.channel_members
  set last_seen_at = pg_catalog.now()
  where id = v_member_id;

  update guest.channels
  set last_activity_at = pg_catalog.now()
  where id = p_channel_id;

  return v_message;
end;
$$;

create function guest.edit_message(
  p_channel_id uuid,
  p_message_id uuid,
  p_content text
)
returns guest.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_message guest.messages%rowtype;
begin
  v_member_id := guest.current_member_id(p_channel_id);

  if v_member_id is null then
    raise exception using errcode = '42501', message = 'Active channel membership required.';
  end if;

  if p_content is null
    or pg_catalog.char_length(p_content) not between 1 and 4000
    or p_content ~ '^[[:space:]]*$'
  then
    raise exception using
      errcode = '22023',
      message = 'Message content must contain 1 to 4000 characters.';
  end if;

  update guest.messages as m
  set
    content = p_content,
    edited_at = pg_catalog.now()
  where m.id = p_message_id
    and m.channel_id = p_channel_id
    and m.sender_member_id = v_member_id
    and m.deleted_at is null
  returning * into v_message;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only the sender can edit this active message.';
  end if;

  update guest.channels
  set last_activity_at = pg_catalog.now()
  where id = p_channel_id;

  return v_message;
end;
$$;

create function guest.delete_message(
  p_channel_id uuid,
  p_message_id uuid
)
returns guest.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_message guest.messages%rowtype;
begin
  v_member_id := guest.current_member_id(p_channel_id);

  if v_member_id is null then
    raise exception using errcode = '42501', message = 'Active channel membership required.';
  end if;

  update guest.messages as m
  set deleted_at = coalesce(m.deleted_at, pg_catalog.now())
  where m.id = p_message_id
    and m.channel_id = p_channel_id
    and m.sender_member_id = v_member_id
  returning * into v_message;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only the sender can delete this message.';
  end if;

  return v_message;
end;
$$;

create function guest.toggle_message_reaction(
  p_channel_id uuid,
  p_message_id uuid,
  p_emoji text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_deleted integer;
begin
  v_member_id := guest.current_member_id(p_channel_id);

  if v_member_id is null then
    raise exception using errcode = '42501', message = 'Active channel membership required.';
  end if;

  if p_emoji is null
    or pg_catalog.char_length(p_emoji) not between 1 and 32
    or p_emoji ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'Emoji reaction is invalid.';
  end if;

  if not exists (
    select 1
    from guest.messages as m
    where m.id = p_message_id
      and m.channel_id = p_channel_id
      and m.deleted_at is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'Message does not exist in this channel.';
  end if;

  delete from guest.message_reactions as mr
  where mr.channel_id = p_channel_id
    and mr.message_id = p_message_id
    and mr.member_id = v_member_id
    and mr.emoji = p_emoji;

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    return false;
  end if;

  insert into guest.message_reactions (
    channel_id,
    message_id,
    member_id,
    emoji
  )
  values (
    p_channel_id,
    p_message_id,
    v_member_id,
    p_emoji
  );

  update guest.channel_members
  set last_seen_at = pg_catalog.now()
  where id = v_member_id;

  update guest.channels
  set last_activity_at = pg_catalog.now()
  where id = p_channel_id;

  return true;
end;
$$;

create function guest.leave_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_owner_member_id uuid;
begin
  v_member_id := guest.current_member_id(p_channel_id);

  if v_member_id is null then
    raise exception using errcode = 'P0002', message = 'Active channel membership was not found.';
  end if;

  select c.owner_member_id
  into v_owner_member_id
  from guest.channels as c
  where c.id = p_channel_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Guest channel was not found.';
  end if;

  update guest.channel_members
  set
    left_at = coalesce(left_at, pg_catalog.now()),
    last_seen_at = pg_catalog.now()
  where id = v_member_id
    and channel_id = p_channel_id
    and removed_at is null;

  if v_member_id = v_owner_member_id then
    update guest.channels
    set
      status = 'ended',
      ended_at = pg_catalog.now(),
      ended_reason = 'closed_by_owner',
      empty_since = coalesce(empty_since, pg_catalog.now())
    where id = p_channel_id;

    return;
  end if;

  if not exists (
    select 1
    from guest.channel_members as cm
    where cm.channel_id = p_channel_id
      and cm.left_at is null
      and cm.removed_at is null
  ) then
    update guest.channels
    set empty_since = coalesce(empty_since, pg_catalog.now())
    where id = p_channel_id
      and status = 'active';
  end if;
end;
$$;

create function guest.close_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
begin
  v_member_id := guest.current_member_id(p_channel_id);

  if v_member_id is null then
    raise exception using errcode = '42501', message = 'Active channel membership required.';
  end if;

  update guest.channels
  set
    status = 'ended',
    ended_at = pg_catalog.now(),
    ended_reason = 'closed_by_owner',
    empty_since = coalesce(empty_since, pg_catalog.now())
  where id = p_channel_id
    and owner_member_id = v_member_id
    and status = 'active';

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only the active channel owner can close this channel.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Browser-readable rows: SELECT is protected by membership-based RLS.
--    Mutations remain RPC-only; authenticated receives no direct write grants.
-- -----------------------------------------------------------------------------

grant usage on schema guest to authenticated;
grant usage on type guest.channel_status, guest.channel_end_reason, guest.message_type to authenticated;

grant select on
  guest.channels,
  guest.channel_members,
  guest.messages,
  guest.message_reactions
to authenticated;

drop policy if exists guest_channels_members_select on guest.channels;
create policy guest_channels_members_select
on guest.channels
for select
to authenticated
using (guest.is_active_channel_member(id));

drop policy if exists guest_channel_members_members_select on guest.channel_members;
create policy guest_channel_members_members_select
on guest.channel_members
for select
to authenticated
using (guest.is_active_channel_member(channel_id));

drop policy if exists guest_messages_members_select on guest.messages;
create policy guest_messages_members_select
on guest.messages
for select
to authenticated
using (guest.is_active_channel_member(channel_id));

drop policy if exists guest_message_reactions_members_select on guest.message_reactions;
create policy guest_message_reactions_members_select
on guest.message_reactions
for select
to authenticated
using (guest.is_active_channel_member(channel_id));

-- -----------------------------------------------------------------------------
-- 7. Function permissions. PostgreSQL functions are executable by PUBLIC by
--    default, so revoke broadly and grant only the intended API surface.
-- -----------------------------------------------------------------------------

revoke all on function guest.requester_is_anonymous() from public, anon, authenticated;
revoke all on function guest.resolve_requester_display_name(text) from public, anon, authenticated;
revoke all on function guest.current_member_id(uuid) from public, anon, authenticated;
revoke all on function guest.is_active_channel_member(uuid) from public, anon, authenticated;

revoke all on function guest.create_channel(text, text, integer, integer) from public, anon, authenticated;
revoke all on function guest.join_channel(text, text) from public, anon, authenticated;
revoke all on function guest.create_message(uuid, text, uuid, guest.message_type, uuid) from public, anon, authenticated;
revoke all on function guest.edit_message(uuid, uuid, text) from public, anon, authenticated;
revoke all on function guest.delete_message(uuid, uuid) from public, anon, authenticated;
revoke all on function guest.toggle_message_reaction(uuid, uuid, text) from public, anon, authenticated;
revoke all on function guest.leave_channel(uuid) from public, anon, authenticated;
revoke all on function guest.close_channel(uuid) from public, anon, authenticated;

-- RLS policies invoke this helper as the requesting role.
grant execute on function guest.is_active_channel_member(uuid) to authenticated;

-- Public browser RPC surface.
grant execute on function guest.create_channel(text, text, integer, integer) to authenticated;
grant execute on function guest.join_channel(text, text) to authenticated;
grant execute on function guest.create_message(uuid, text, uuid, guest.message_type, uuid) to authenticated;
grant execute on function guest.edit_message(uuid, uuid, text) to authenticated;
grant execute on function guest.delete_message(uuid, uuid) to authenticated;
grant execute on function guest.toggle_message_reaction(uuid, uuid, text) to authenticated;
grant execute on function guest.leave_channel(uuid) to authenticated;
grant execute on function guest.close_channel(uuid) to authenticated;

-- service_role keeps administrative access and cron/cleanup capabilities.
grant usage on schema guest to service_role;
grant all on all tables in schema guest to service_role;
grant all on all sequences in schema guest to service_role;
grant execute on all routines in schema guest to service_role;

-- -----------------------------------------------------------------------------
-- 8. Realtime Postgres Changes publication.
-- -----------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'channels',
    'channel_members',
    'messages',
    'message_reactions'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'guest'
        and tablename = v_table
    ) then
      execute pg_catalog.format(
        'alter publication supabase_realtime add table guest.%I',
        v_table
      );
    end if;
  end loop;
end
$$;

-- Useful for UPDATE payloads such as edited/deleted messages and member presence.
alter table guest.channels replica identity full;
alter table guest.channel_members replica identity full;
alter table guest.messages replica identity full;
alter table guest.message_reactions replica identity full;
