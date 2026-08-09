-- Lobby guest schema
-- WARNING: destructive rebuild. This drops the existing guest schema and all its data.

-- Remove old guest cleanup jobs before dropping functions they may reference.
do $$
declare
  v_job record;
begin
  if to_regclass('cron.job') is not null then
    for v_job in execute $query$
      select jobname
      from cron.job
      where jobname in (
        'guest-expire-due-channels',
        'guest-purge-ended-channels',
        'guest-expire-due-rooms'
      )
    $query$
    loop
      execute format('select cron.unschedule(%L)', v_job.jobname);
    end loop;
  end if;
end
$$;

drop schema if exists guest cascade;
create schema guest authorization postgres;

comment on schema guest is
  'Ephemeral Lobby channels used by guests and authenticated users.';

create type guest.channel_status as enum (
  'active',
  'expired',
  'ended'
);

create type guest.channel_end_reason as enum (
  'expired',
  'closed_by_owner',
  'empty',
  'moderation'
);

create type guest.member_kind as enum (
  'guest',
  'authenticated'
);

create type guest.message_type as enum (
  'text',
  'system',
  'file',
  'image'
);

create table guest.channels (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name varchar(80) not null,
  owner_member_id uuid,
  livekit_room_name text not null,
  max_members smallint not null default 25,
  status guest.channel_status not null default 'active',
  expires_at timestamptz not null default (now() + interval '1 hour'),
  last_activity_at timestamptz not null default now(),
  empty_since timestamptz,
  ended_at timestamptz,
  ended_reason guest.channel_end_reason,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guest_channels_code_key unique (code),
  constraint guest_channels_livekit_room_name_key unique (livekit_room_name),
  constraint guest_channels_code_format_check
    check (code ~ '^[A-Z0-9]{8,12}$'),
  constraint guest_channels_name_check
    check (
      char_length(btrim(name)) between 1 and 80
      and btrim(name) !~ '[[:cntrl:]]'
    ),
  constraint guest_channels_max_members_check
    check (max_members between 2 and 100),
  constraint guest_channels_expiry_check
    check (expires_at > created_at),
  constraint guest_channels_end_state_check
    check (
      (status = 'active' and ended_at is null and ended_reason is null)
      or
      (status <> 'active' and ended_at is not null and ended_reason is not null)
    )
);

create table guest.channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null
    references guest.channels(id) on delete cascade,
  kind guest.member_kind not null,
  user_id uuid
    references auth.users(id) on delete cascade,
  session_token_hash text,
  display_name varchar(40) not null,
  livekit_identity text not null,
  joined_at timestamptz not null default now(),
  last_joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  removed_at timestamptz,
  removed_reason varchar(240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guest_channel_members_channel_id_id_key
    unique (channel_id, id),
  constraint guest_channel_members_livekit_identity_key
    unique (livekit_identity),
  constraint guest_channel_members_display_name_check
    check (
      char_length(btrim(display_name)) between 1 and 40
      and btrim(display_name) !~ '[[:cntrl:]]'
    ),
  constraint guest_channel_members_identity_check
    check (
      (
        kind = 'guest'
        and user_id is null
        and session_token_hash is not null
      )
      or
      (
        kind = 'authenticated'
        and user_id is not null
        and session_token_hash is null
      )
    ),
  constraint guest_channel_members_session_hash_check
    check (
      session_token_hash is null
      or session_token_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint guest_channel_members_removal_check
    check (
      (removed_at is null and removed_reason is null)
      or
      (removed_at is not null and removed_reason is not null)
    )
);

-- A channel and its owner member are created in one transaction, so this FK is deferred.
alter table guest.channels
  add constraint guest_channels_owner_member_fk
  foreign key (id, owner_member_id)
  references guest.channel_members(channel_id, id)
  on delete set null (owner_member_id)
  deferrable initially deferred;

create table guest.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null
    references guest.channels(id) on delete cascade,
  sender_member_id uuid,
  type guest.message_type not null default 'text',
  content text not null,
  client_message_id uuid,
  reply_to uuid,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guest_messages_channel_id_id_key
    unique (channel_id, id),
  constraint guest_messages_content_check
    check (
      char_length(content) between 1 and 4000
      and content !~ '^[[:space:]]*$'
    ),
  constraint guest_messages_not_self_reply_check
    check (reply_to is null or reply_to <> id),
  constraint guest_messages_sender_fk
    foreign key (channel_id, sender_member_id)
    references guest.channel_members(channel_id, id)
    on delete set null (sender_member_id),
  constraint guest_messages_reply_fk
    foreign key (channel_id, reply_to)
    references guest.messages(channel_id, id)
    on delete set null (reply_to)
);

create table guest.message_reactions (
  channel_id uuid not null,
  message_id uuid not null,
  member_id uuid not null,
  emoji text not null,
  created_at timestamptz not null default now(),

  primary key (message_id, member_id, emoji),
  constraint guest_message_reactions_channel_fk
    foreign key (channel_id)
    references guest.channels(id)
    on delete cascade,
  constraint guest_message_reactions_message_fk
    foreign key (channel_id, message_id)
    references guest.messages(channel_id, id)
    on delete cascade,
  constraint guest_message_reactions_member_fk
    foreign key (channel_id, member_id)
    references guest.channel_members(channel_id, id)
    on delete cascade,
  constraint guest_message_reactions_emoji_check
    check (
      char_length(emoji) between 1 and 32
      and emoji !~ '[[:cntrl:]]'
    )
);

-- Duplicate display names are intentionally allowed.
-- An authenticated account may only have one active membership per channel.
create unique index guest_channel_members_active_user_key
  on guest.channel_members(channel_id, user_id)
  where user_id is not null
    and left_at is null
    and removed_at is null;

-- A raw guest token is generated by NestJS. Only its SHA-256 hash is stored.
-- Each token identifies one guest membership and can be used to rejoin it.
create unique index guest_channel_members_session_token_hash_key
  on guest.channel_members(session_token_hash)
  where session_token_hash is not null;

-- Prevent duplicate chat messages when a client retries after a reconnect.
create unique index guest_messages_client_id_key
  on guest.messages(channel_id, sender_member_id, client_message_id)
  where client_message_id is not null and sender_member_id is not null;

create index guest_channels_active_expiry_idx
  on guest.channels(expires_at)
  where status = 'active';

create index guest_channels_empty_since_idx
  on guest.channels(empty_since)
  where status = 'active' and empty_since is not null;

create index guest_channels_ended_at_idx
  on guest.channels(ended_at)
  where status <> 'active';

create index guest_channel_members_channel_active_idx
  on guest.channel_members(channel_id, joined_at)
  where left_at is null and removed_at is null;

create index guest_channel_members_user_idx
  on guest.channel_members(user_id)
  where user_id is not null;

create index guest_messages_channel_created_idx
  on guest.messages(channel_id, created_at desc);

create index guest_messages_reply_to_idx
  on guest.messages(reply_to)
  where reply_to is not null;

create index guest_message_reactions_channel_message_idx
  on guest.message_reactions(channel_id, message_id);

create function guest.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, guest
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger guest_channels_set_updated_at
before update on guest.channels
for each row execute function guest.set_updated_at();

create trigger guest_channel_members_set_updated_at
before update on guest.channel_members
for each row execute function guest.set_updated_at();

create trigger guest_messages_set_updated_at
before update on guest.messages
for each row execute function guest.set_updated_at();

create function guest.generate_channel_code()
returns text
language plpgsql
volatile
set search_path = pg_catalog, guest
as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    exit when not exists (
      select 1
      from guest.channels c
      where c.code = v_code
    );
  end loop;

  return v_code;
end;
$$;

create function guest.validate_member_input(
  p_display_name text,
  p_user_id uuid,
  p_session_token_hash text
)
returns guest.member_kind
language plpgsql
set search_path = pg_catalog, guest
as $$
begin
  if p_display_name is null
    or char_length(btrim(p_display_name)) not between 1 and 40
    or btrim(p_display_name) ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'Display name must contain 1 to 40 visible characters.';
  end if;

  if (p_user_id is null) = (p_session_token_hash is null) then
    raise exception using
      errcode = '22023',
      message = 'Provide exactly one identity: user_id for an authenticated user or session_token_hash for a guest.';
  end if;

  if p_session_token_hash is not null
    and lower(p_session_token_hash) !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'session_token_hash must be a SHA-256 hash encoded as 64 hexadecimal characters.';
  end if;

  if p_user_id is not null then
    return 'authenticated'::guest.member_kind;
  end if;

  return 'guest'::guest.member_kind;
end;
$$;

create function guest.create_channel(
  p_name text,
  p_display_name text,
  p_session_token_hash text default null,
  p_user_id uuid default null,
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
set search_path = pg_catalog, guest
as $$
declare
  v_kind guest.member_kind;
  v_channel_id uuid := gen_random_uuid();
  v_owner_member_id uuid := gen_random_uuid();
  v_code text;
  v_livekit_room_name text;
  v_expires_at timestamptz;
begin
  v_kind := guest.validate_member_input(
    p_display_name,
    p_user_id,
    p_session_token_hash
  );

  if p_name is null
    or char_length(btrim(p_name)) not between 1 and 80
    or btrim(p_name) ~ '[[:cntrl:]]'
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
  v_expires_at := now() + make_interval(mins => p_lifetime_minutes);

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
    btrim(p_name),
    v_owner_member_id,
    v_livekit_room_name,
    p_max_members,
    v_expires_at
  );

  insert into guest.channel_members (
    id,
    channel_id,
    kind,
    user_id,
    session_token_hash,
    display_name,
    livekit_identity
  )
  values (
    v_owner_member_id,
    v_channel_id,
    v_kind,
    p_user_id,
    case
      when p_session_token_hash is null then null
      else lower(p_session_token_hash)
    end,
    btrim(p_display_name),
    case
      when v_kind = 'authenticated' then 'user:'
      else 'guest:'
    end || v_owner_member_id::text
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
  p_display_name text,
  p_session_token_hash text default null,
  p_user_id uuid default null
)
returns table (
  channel_id uuid,
  member_id uuid,
  livekit_room_name text,
  expires_at timestamptz,
  rejoined boolean
)
language plpgsql
set search_path = pg_catalog, guest
as $$
declare
  v_kind guest.member_kind;
  v_channel guest.channels%rowtype;
  v_member guest.channel_members%rowtype;
  v_member_id uuid;
  v_active_count integer;
begin
  v_kind := guest.validate_member_input(
    p_display_name,
    p_user_id,
    p_session_token_hash
  );

  select c.*
  into v_channel
  from guest.channels c
  where c.code = upper(btrim(p_code))
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Guest channel was not found.';
  end if;

  if v_channel.status <> 'active' or v_channel.expires_at <= now() then
    raise exception using
      errcode = '55000',
      message = 'Guest channel is no longer active.';
  end if;

  select cm.*
  into v_member
  from guest.channel_members cm
  where cm.channel_id = v_channel.id
    and (
      (p_user_id is not null and cm.user_id = p_user_id)
      or
      (
        p_session_token_hash is not null
        and cm.session_token_hash = lower(p_session_token_hash)
      )
    )
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
      display_name = btrim(p_display_name),
      left_at = null,
      last_joined_at = now(),
      last_seen_at = now()
    where id = v_member.id;

    update guest.channels
    set
      empty_since = null,
      last_activity_at = now()
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
  from guest.channel_members cm
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
    kind,
    user_id,
    session_token_hash,
    display_name,
    livekit_identity
  )
  values (
    v_member_id,
    v_channel.id,
    v_kind,
    p_user_id,
    case
      when p_session_token_hash is null then null
      else lower(p_session_token_hash)
    end,
    btrim(p_display_name),
    case
      when v_kind = 'authenticated' then 'user:'
      else 'guest:'
    end || v_member_id::text
  );

  update guest.channels
  set
    empty_since = null,
    last_activity_at = now()
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
  p_member_id uuid,
  p_content text,
  p_reply_to uuid default null,
  p_type guest.message_type default 'text',
  p_client_message_id uuid default null
)
returns guest.messages
language plpgsql
set search_path = pg_catalog, guest
as $$
declare
  v_message guest.messages%rowtype;
begin
  if p_type is null or p_type = 'system' then
    raise exception using
      errcode = '22023',
      message = 'System messages cannot be created through create_message.';
  end if;

  if p_content is null
    or char_length(p_content) not between 1 and 4000
    or p_content ~ '^[[:space:]]*$'
  then
    raise exception using
      errcode = '22023',
      message = 'Message content must contain 1 to 4000 characters.';
  end if;

  if not exists (
    select 1
    from guest.channels c
    join guest.channel_members cm
      on cm.channel_id = c.id
    where c.id = p_channel_id
      and c.status = 'active'
      and c.expires_at > now()
      and cm.id = p_member_id
      and cm.left_at is null
      and cm.removed_at is null
  ) then
    raise exception using
      errcode = '42501',
      message = 'The member is not active in this channel.';
  end if;

  if p_reply_to is not null
    and not exists (
      select 1
      from guest.messages m
      where m.id = p_reply_to
        and m.channel_id = p_channel_id
        and m.deleted_at is null
    )
  then
    raise exception using
      errcode = '23503',
      message = 'The reply target does not exist in this channel.';
  end if;

  -- Return the existing row when the client retries the same message.
  if p_client_message_id is not null then
    select m.*
    into v_message
    from guest.messages m
    where m.channel_id = p_channel_id
      and m.sender_member_id = p_member_id
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
    p_member_id,
    p_type,
    p_content,
    p_client_message_id,
    p_reply_to
  )
  returning * into v_message;

  update guest.channel_members
  set last_seen_at = now()
  where id = p_member_id;

  update guest.channels
  set last_activity_at = now()
  where id = p_channel_id;

  return v_message;
end;
$$;

create function guest.edit_message(
  p_channel_id uuid,
  p_message_id uuid,
  p_member_id uuid,
  p_content text
)
returns guest.messages
language plpgsql
set search_path = pg_catalog, guest
as $$
declare
  v_message guest.messages%rowtype;
begin
  if p_content is null
    or char_length(p_content) not between 1 and 4000
    or p_content ~ '^[[:space:]]*$'
  then
    raise exception using
      errcode = '22023',
      message = 'Message content must contain 1 to 4000 characters.';
  end if;

  update guest.messages m
  set
    content = p_content,
    edited_at = now()
  where m.id = p_message_id
    and m.channel_id = p_channel_id
    and m.sender_member_id = p_member_id
    and m.deleted_at is null
  returning * into v_message;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only the sender can edit this active message.';
  end if;

  update guest.channels
  set last_activity_at = now()
  where id = p_channel_id;

  return v_message;
end;
$$;

create function guest.delete_message(
  p_channel_id uuid,
  p_message_id uuid,
  p_member_id uuid
)
returns guest.messages
language plpgsql
set search_path = pg_catalog, guest
as $$
declare
  v_message guest.messages%rowtype;
begin
  update guest.messages m
  set deleted_at = coalesce(m.deleted_at, now())
  where m.id = p_message_id
    and m.channel_id = p_channel_id
    and m.sender_member_id = p_member_id
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
  p_member_id uuid,
  p_emoji text
)
returns boolean
language plpgsql
set search_path = pg_catalog, guest
as $$
declare
  v_deleted integer;
begin
  if p_emoji is null
    or char_length(p_emoji) not between 1 and 32
    or p_emoji ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'Emoji reaction is invalid.';
  end if;

  if not exists (
    select 1
    from guest.channel_members cm
    where cm.id = p_member_id
      and cm.channel_id = p_channel_id
      and cm.left_at is null
      and cm.removed_at is null
  ) then
    raise exception using
      errcode = '42501',
      message = 'The member is not active in this channel.';
  end if;

  if not exists (
    select 1
    from guest.messages m
    where m.id = p_message_id
      and m.channel_id = p_channel_id
      and m.deleted_at is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'Message does not exist in this channel.';
  end if;

  delete from guest.message_reactions mr
  where mr.channel_id = p_channel_id
    and mr.message_id = p_message_id
    and mr.member_id = p_member_id
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
    p_member_id,
    p_emoji
  );

  update guest.channel_members
  set last_seen_at = now()
  where id = p_member_id;

  update guest.channels
  set last_activity_at = now()
  where id = p_channel_id;

  return true;
end;
$$;

create function guest.leave_channel(
  p_channel_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
set search_path = pg_catalog, guest
as $$
declare
  v_owner_member_id uuid;
begin
  select c.owner_member_id
  into v_owner_member_id
  from guest.channels c
  where c.id = p_channel_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Guest channel was not found.';
  end if;

  update guest.channel_members
  set
    left_at = coalesce(left_at, now()),
    last_seen_at = now()
  where id = p_member_id
    and channel_id = p_channel_id
    and removed_at is null;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Channel member was not found.';
  end if;

  if p_member_id = v_owner_member_id then
    update guest.channels
    set
      status = 'ended',
      ended_at = now(),
      ended_reason = 'closed_by_owner',
      empty_since = coalesce(empty_since, now())
    where id = p_channel_id;

    return;
  end if;

  if not exists (
    select 1
    from guest.channel_members cm
    where cm.channel_id = p_channel_id
      and cm.left_at is null
      and cm.removed_at is null
  ) then
    update guest.channels
    set empty_since = coalesce(empty_since, now())
    where id = p_channel_id
      and status = 'active';
  end if;
end;
$$;

create function guest.close_channel(
  p_channel_id uuid,
  p_owner_member_id uuid
)
returns void
language plpgsql
set search_path = pg_catalog, guest
as $$
begin
  update guest.channels
  set
    status = 'ended',
    ended_at = now(),
    ended_reason = 'closed_by_owner',
    empty_since = coalesce(empty_since, now())
  where id = p_channel_id
    and owner_member_id = p_owner_member_id
    and status = 'active';

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only the active channel owner can close this channel.';
  end if;
end;
$$;

create function guest.expire_due_channels(
  p_empty_grace_minutes integer default 15
)
returns table (
  channel_id uuid,
  livekit_room_name text,
  ended_reason guest.channel_end_reason
)
language plpgsql
set search_path = pg_catalog, guest
as $$
begin
  if p_empty_grace_minutes is null
    or p_empty_grace_minutes not between 0 and 1440
  then
    raise exception using
      errcode = '22023',
      message = 'empty_grace_minutes must be between 0 and 1440.';
  end if;

  return query
  update guest.channels c
  set
    status = case
      when c.expires_at <= now() then 'expired'::guest.channel_status
      else 'ended'::guest.channel_status
    end,
    ended_at = now(),
    ended_reason = case
      when c.expires_at <= now() then 'expired'::guest.channel_end_reason
      else 'empty'::guest.channel_end_reason
    end
  where c.status = 'active'
    and (
      c.expires_at <= now()
      or (
        c.empty_since is not null
        and c.empty_since <= now() - make_interval(mins => p_empty_grace_minutes)
      )
    )
  returning c.id, c.livekit_room_name, c.ended_reason;
end;
$$;

create function guest.purge_ended_channels(
  p_retention_minutes integer default 15
)
returns bigint
language plpgsql
set search_path = pg_catalog, guest
as $$
declare
  v_deleted bigint;
begin
  if p_retention_minutes is null
    or p_retention_minutes not between 0 and 10080
  then
    raise exception using
      errcode = '22023',
      message = 'retention_minutes must be between 0 and 10080.';
  end if;

  delete from guest.channels c
  where c.status <> 'active'
    and c.ended_at <= now() - make_interval(mins => p_retention_minutes);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- This schema is server-owned. Angular should call NestJS; NestJS uses service_role.
alter table guest.channels enable row level security;
alter table guest.channel_members enable row level security;
alter table guest.messages enable row level security;
alter table guest.message_reactions enable row level security;

revoke all on schema guest from public, anon, authenticated;
revoke all on all tables in schema guest from public, anon, authenticated;
revoke all on all sequences in schema guest from public, anon, authenticated;
revoke all on all routines in schema guest from public, anon, authenticated;

grant usage on schema guest to service_role;
grant all on all tables in schema guest to service_role;
grant all on all sequences in schema guest to service_role;
grant execute on all routines in schema guest to service_role;

alter default privileges for role postgres in schema guest
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema guest
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema guest
  revoke execute on routines from public, anon, authenticated;

alter default privileges for role postgres in schema guest
  grant all on tables to service_role;
alter default privileges for role postgres in schema guest
  grant all on sequences to service_role;
alter default privileges for role postgres in schema guest
  grant execute on routines to service_role;
