-- Registered guest-room creators may configure call capacity and room lifetime.
-- Anonymous creators retain the existing defaults: 8 call participants and 60 minutes.

alter table guest.channels
  add column max_call_participants smallint not null default 8,
  add constraint guest_channels_max_call_participants_check
    check (max_call_participants between 2 and 50),
  add constraint guest_channels_max_lifetime_check
    check (expires_at <= created_at + interval '3 hours') not valid;

comment on column guest.channels.max_members is
  'Maximum active guest-channel memberships. This is independent of call capacity.';

comment on column guest.channels.max_call_participants is
  'Maximum simultaneous LiveKit participants. LiveKit remains the final enforcement layer.';

-- Replace the prior four-argument RPC. Its third argument represented channel
-- membership capacity, which must not be confused with LiveKit call capacity.
drop function if exists guest.create_channel(text, text, integer, integer);

create function guest.create_channel(
  p_name text,
  p_display_name text default null,
  p_max_call_participants integer default null,
  p_lifetime_minutes integer default null
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
  v_is_anonymous boolean;
  v_display_name text;
  v_channel_id uuid := gen_random_uuid();
  v_owner_member_id uuid := gen_random_uuid();
  v_code text;
  v_livekit_room_name text;
  v_max_call_participants integer;
  v_lifetime_minutes integer;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  v_is_anonymous := guest.requester_is_anonymous();

  if v_is_anonymous
    and (p_max_call_participants is not null or p_lifetime_minutes is not null)
  then
    raise exception using
      errcode = '42501',
      message = 'Advanced room configuration requires a registered Lobby account.';
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

  v_max_call_participants := coalesce(p_max_call_participants, 8);
  if v_max_call_participants not between 2 and 50 then
    raise exception using
      errcode = '22023',
      message = 'max_call_participants must be between 2 and 50.';
  end if;

  v_lifetime_minutes := coalesce(p_lifetime_minutes, 60);
  if v_lifetime_minutes not between 5 and 180 then
    raise exception using
      errcode = '22023',
      message = 'lifetime_minutes must be between 5 and 180.';
  end if;

  v_code := guest.generate_channel_code();
  v_livekit_room_name := 'guest-' || v_channel_id::text;
  v_expires_at :=
    pg_catalog.now() + pg_catalog.make_interval(mins => v_lifetime_minutes);

  insert into guest.channels (
    id,
    code,
    name,
    owner_member_id,
    livekit_room_name,
    max_members,
    max_call_participants,
    expires_at
  )
  values (
    v_channel_id,
    v_code,
    pg_catalog.btrim(p_name),
    v_owner_member_id,
    v_livekit_room_name,
    -- Keep the anonymous channel-membership default. Registered rooms need
    -- headroom above the maximum 50-person call so people can remain in chat.
    case when v_is_anonymous then 25 else 100 end,
    v_max_call_participants,
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

revoke all on function guest.create_channel(text, text, integer, integer)
from public, anon, authenticated;

grant execute on function guest.create_channel(text, text, integer, integer)
to authenticated, service_role;
