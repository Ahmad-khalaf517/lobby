-- Owner moderation for guest channels.
--
-- Kicks are reversible: the same Supabase identity can use join_channel again.
-- Blocks persist for the life of the channel and are checked before any
-- membership is restored or created.

create type guest.member_removal_kind as enum (
  'kicked',
  'blocked'
);

alter table guest.channel_members
  add column removed_kind guest.member_removal_kind,
  add column removed_by_member_id uuid;

-- Preserve the meaning of any removal performed before this migration.
update guest.channel_members
set removed_kind = 'kicked'
where removed_at is not null;

alter table guest.channel_members
  drop constraint guest_channel_members_removal_check,
  add constraint guest_channel_members_removal_check
    check (
      (
        removed_at is null
        and removed_kind is null
        and removed_reason is null
        and removed_by_member_id is null
      )
      or
      (
        removed_at is not null
        and removed_kind is not null
      )
    ),
  add constraint guest_channel_members_removed_by_fk
    foreign key (channel_id, removed_by_member_id)
    references guest.channel_members(channel_id, id)
    on delete set null (removed_by_member_id);

create table guest.channel_blocks (
  channel_id uuid not null,
  user_id uuid not null,
  blocked_by_member_id uuid,
  reason varchar(240),
  created_at timestamptz not null default now(),

  primary key (channel_id, user_id),
  constraint guest_channel_blocks_channel_fk
    foreign key (channel_id)
    references guest.channels(id)
    on delete cascade,
  constraint guest_channel_blocks_user_fk
    foreign key (user_id)
    references auth.users(id)
    on delete cascade,
  constraint guest_channel_blocks_blocked_by_fk
    foreign key (channel_id, blocked_by_member_id)
    references guest.channel_members(channel_id, id)
    on delete set null (blocked_by_member_id),
  constraint guest_channel_blocks_reason_check
    check (
      reason is null
      or (
        char_length(btrim(reason)) between 1 and 240
        and btrim(reason) !~ '[[:cntrl:]]'
      )
    )
);

create index guest_channel_blocks_user_channel_idx
  on guest.channel_blocks(user_id, channel_id);

comment on table guest.channel_blocks is
  'Room-scoped Supabase identities blocked by the active channel owner.';

alter table guest.channel_blocks enable row level security;

-- Block records are intentionally RPC-only. Active members do not need the
-- room moderation history, and blocked users learn only their own clean error.
revoke all on guest.channel_blocks from public, anon, authenticated;
grant all on guest.channel_blocks to service_role;
grant usage on type guest.member_removal_kind to authenticated, service_role;

create function guest.kick_channel_member(
  p_channel_id uuid,
  p_member_id uuid,
  p_reason text default null
)
returns guest.channel_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_member_id uuid;
  v_owner_member_id uuid;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_target guest.channel_members%rowtype;
begin
  v_actor_member_id := guest.current_member_id(p_channel_id);

  if v_actor_member_id is null then
    raise exception using errcode = '42501', message = 'Active channel membership required.';
  end if;

  if v_reason is not null
    and (
      pg_catalog.char_length(v_reason) > 240
      or v_reason ~ '[[:cntrl:]]'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Moderation reason must contain at most 240 visible characters.';
  end if;

  select c.owner_member_id
  into v_owner_member_id
  from guest.channels as c
  where c.id = p_channel_id
    and c.status = 'active'
    and c.expires_at > pg_catalog.now()
  for update;

  if not found or v_owner_member_id <> v_actor_member_id then
    raise exception using
      errcode = '42501',
      message = 'Only the active channel owner can kick members.';
  end if;

  if p_member_id = v_actor_member_id then
    raise exception using
      errcode = '42501',
      message = 'The channel owner cannot kick themselves.';
  end if;

  select cm.*
  into v_target
  from guest.channel_members as cm
  where cm.id = p_member_id
    and cm.channel_id = p_channel_id
    and cm.left_at is null
    and cm.removed_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The active channel member was not found.';
  end if;

  update guest.channel_members as cm
  set
    removed_at = pg_catalog.now(),
    removed_kind = 'kicked',
    removed_reason = v_reason,
    removed_by_member_id = v_actor_member_id,
    last_seen_at = pg_catalog.now()
  where cm.id = v_target.id
  returning cm.* into v_target;

  update guest.channels
  set last_activity_at = pg_catalog.now()
  where id = p_channel_id;

  return v_target;
end;
$$;

create function guest.block_channel_member(
  p_channel_id uuid,
  p_member_id uuid,
  p_reason text default null
)
returns guest.channel_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_member_id uuid;
  v_owner_member_id uuid;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_target guest.channel_members%rowtype;
begin
  v_actor_member_id := guest.current_member_id(p_channel_id);

  if v_actor_member_id is null then
    raise exception using errcode = '42501', message = 'Active channel membership required.';
  end if;

  if v_reason is not null
    and (
      pg_catalog.char_length(v_reason) > 240
      or v_reason ~ '[[:cntrl:]]'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Moderation reason must contain at most 240 visible characters.';
  end if;

  select c.owner_member_id
  into v_owner_member_id
  from guest.channels as c
  where c.id = p_channel_id
    and c.status = 'active'
    and c.expires_at > pg_catalog.now()
  for update;

  if not found or v_owner_member_id <> v_actor_member_id then
    raise exception using
      errcode = '42501',
      message = 'Only the active channel owner can block members.';
  end if;

  if p_member_id = v_actor_member_id then
    raise exception using
      errcode = '42501',
      message = 'The channel owner cannot block themselves.';
  end if;

  select cm.*
  into v_target
  from guest.channel_members as cm
  where cm.id = p_member_id
    and cm.channel_id = p_channel_id
    and cm.left_at is null
    and cm.removed_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The active channel member was not found.';
  end if;

  insert into guest.channel_blocks (
    channel_id,
    user_id,
    blocked_by_member_id,
    reason
  )
  values (
    p_channel_id,
    v_target.user_id,
    v_actor_member_id,
    v_reason
  )
  on conflict (channel_id, user_id) do update
  set
    blocked_by_member_id = excluded.blocked_by_member_id,
    reason = excluded.reason,
    created_at = pg_catalog.now();

  update guest.channel_members as cm
  set
    removed_at = pg_catalog.now(),
    removed_kind = 'blocked',
    removed_reason = v_reason,
    removed_by_member_id = v_actor_member_id,
    last_seen_at = pg_catalog.now()
  where cm.id = v_target.id
  returning cm.* into v_target;

  update guest.channels
  set last_activity_at = pg_catalog.now()
  where id = p_channel_id;

  return v_target;
end;
$$;

-- Replace join_channel so kicks may rejoin while blocks are enforced before a
-- prior membership is restored or a new membership row is inserted.
create or replace function guest.join_channel(
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
  v_block_reason text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

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

  select cb.reason
  into v_block_reason
  from guest.channel_blocks as cb
  where cb.channel_id = v_channel.id
    and cb.user_id = v_user_id;

  if found then
    raise exception using
      errcode = '42501',
      message = case
        when v_block_reason is null then 'You have been blocked from this room.'
        else 'You have been blocked from this room. Reason: ' || v_block_reason
      end;
  end if;

  v_display_name := guest.resolve_requester_display_name(p_display_name);

  select cm.*
  into v_member
  from guest.channel_members as cm
  where cm.channel_id = v_channel.id
    and cm.user_id = v_user_id
  order by cm.created_at desc
  limit 1
  for update;

  if found then
    if v_member.removed_kind = 'blocked' then
      raise exception using
        errcode = '42501',
        message = case
          when v_member.removed_reason is null then 'You have been blocked from this room.'
          else 'You have been blocked from this room. Reason: ' || v_member.removed_reason
        end;
    end if;

    update guest.channel_members
    set
      display_name = v_display_name,
      left_at = null,
      removed_at = null,
      removed_kind = null,
      removed_reason = null,
      removed_by_member_id = null,
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

-- A removed user needs read access to their own membership UPDATE so Realtime
-- can deliver the removal reason and the browser can disconnect from LiveKit.
drop policy guest_channel_members_members_select on guest.channel_members;
create policy guest_channel_members_members_select
on guest.channel_members
for select
to authenticated
using (
  guest.is_active_channel_member(channel_id)
  or user_id = auth.uid()
);

revoke all on function guest.kick_channel_member(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function guest.block_channel_member(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function guest.kick_channel_member(uuid, uuid, text) to authenticated;
grant execute on function guest.block_channel_member(uuid, uuid, text) to authenticated;

grant execute on function guest.kick_channel_member(uuid, uuid, text) to service_role;
grant execute on function guest.block_channel_member(uuid, uuid, text) to service_role;
