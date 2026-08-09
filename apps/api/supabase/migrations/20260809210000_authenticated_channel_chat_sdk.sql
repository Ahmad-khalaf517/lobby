begin;

-- Resolve the caller's active normalized channel membership without accepting
-- a user or member id from the browser. This helper is intentionally private;
-- only the narrow chat RPCs below may execute it.
create function public.require_authenticated_channel_member(p_channel_id uuid)
returns public.channel_members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.channel_members%rowtype;
begin
  if auth.uid() is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '42501',
      message = 'A registered account is required.';
  end if;

  select channel_member.*
  into v_member
  from public.channel_members as channel_member
  join public.channels as channel
    on channel.id = channel_member.channel_id
  join public.server_members as server_member
    on server_member.server_id = channel.server_id
   and server_member.user_id = auth.uid()
  where channel_member.channel_id = p_channel_id
    and channel_member.user_id = auth.uid()
    and channel_member.left_at is null
    and channel_member.removed_at is null;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Active channel membership is required.';
  end if;

  return v_member;
end;
$$;

revoke all on function public.require_authenticated_channel_member(uuid)
  from public, anon, authenticated;

-- Server membership grants initial channel access. An existing left/removed
-- channel membership is never reactivated, matching the dashboard guard.
create function public.join_authenticated_channel_chat(p_channel_id uuid)
returns public.channel_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member public.channel_members%rowtype;
  v_server_role public.server_role;
begin
  if auth.uid() is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '42501',
      message = 'A registered account is required.';
  end if;

  select server_member.role
  into v_server_role
  from public.channels as channel
  join public.server_members as server_member
    on server_member.server_id = channel.server_id
   and server_member.user_id = auth.uid()
  where channel.id = p_channel_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Server membership is required.';
  end if;

  select channel_member.*
  into v_member
  from public.channel_members as channel_member
  where channel_member.channel_id = p_channel_id
    and channel_member.user_id = auth.uid();

  if found then
    if v_member.left_at is not null or v_member.removed_at is not null then
      raise exception using
        errcode = '42501',
        message = 'Channel access has been revoked.';
    end if;
    return v_member;
  end if;

  insert into public.channel_members (channel_id, user_id, role)
  values (p_channel_id, auth.uid(), v_server_role::text::public.channel_role)
  on conflict (channel_id, user_id) do nothing
  returning * into v_member;

  if not found then
    select channel_member.*
    into v_member
    from public.channel_members as channel_member
    where channel_member.channel_id = p_channel_id
      and channel_member.user_id = auth.uid();

    if not found
      or v_member.left_at is not null
      or v_member.removed_at is not null then
      raise exception using
        errcode = '42501',
        message = 'Channel access has been revoked.';
    end if;
  end if;

  return v_member;
end;
$$;

create or replace function public.list_authenticated_channel_chat_members(
  p_channel_id uuid
)
returns table (
  channel_member_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_authenticated_channel_member(p_channel_id);

  return query
  select
    channel_member.id,
    channel_member.user_id,
    app_user.name::text,
    app_user.avatar_url::text
  from public.channel_members as channel_member
  join public.users as app_user
    on app_user.id = channel_member.user_id
  where channel_member.channel_id = p_channel_id
  order by channel_member.joined_at, channel_member.id;
end;
$$;

create function public.create_authenticated_channel_message(
  p_channel_id uuid,
  p_content text,
  p_client_message_id uuid,
  p_reply_to uuid default null
)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member public.channel_members%rowtype;
  v_message public.messages%rowtype;
  v_content text := btrim(p_content);
begin
  v_member := public.require_authenticated_channel_member(p_channel_id);

  if v_content is null or char_length(v_content) < 1 or char_length(v_content) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'Message content must contain between 1 and 2000 characters.';
  end if;

  if p_client_message_id is null then
    raise exception using
      errcode = '22023',
      message = 'A client message id is required.';
  end if;

  if p_reply_to is not null and not exists (
    select 1
    from public.messages as reply
    where reply.id = p_reply_to
      and reply.channel_id = p_channel_id
      and reply.deleted_at is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'The reply target is unavailable.';
  end if;

  select message.*
  into v_message
  from public.messages as message
  where message.channel_id = p_channel_id
    and message.sender_id = v_member.id
    and message.client_message_id = p_client_message_id;

  if found then
    return v_message;
  end if;

  insert into public.messages (
    channel_id,
    sender_id,
    content,
    reply_to,
    client_message_id
  )
  values (
    p_channel_id,
    v_member.id,
    v_content,
    p_reply_to,
    p_client_message_id
  )
  on conflict do nothing
  returning * into v_message;

  if not found then
    select message.*
    into v_message
    from public.messages as message
    where message.channel_id = p_channel_id
      and message.sender_id = v_member.id
      and message.client_message_id = p_client_message_id;
  end if;

  if not found then
    raise exception 'Message could not be created.';
  end if;

  return v_message;
end;
$$;

create function public.edit_authenticated_channel_message(
  p_channel_id uuid,
  p_message_id uuid,
  p_content text
)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member public.channel_members%rowtype;
  v_message public.messages%rowtype;
  v_content text := btrim(p_content);
begin
  v_member := public.require_authenticated_channel_member(p_channel_id);

  if v_content is null or char_length(v_content) < 1 or char_length(v_content) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'Message content must contain between 1 and 2000 characters.';
  end if;

  update public.messages as message
  set content = v_content,
      edited_at = now()
  where message.id = p_message_id
    and message.channel_id = p_channel_id
    and message.sender_id = v_member.id
    and message.deleted_at is null
  returning message.* into v_message;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only the message owner can edit an active message.';
  end if;

  return v_message;
end;
$$;

create function public.delete_authenticated_channel_message(
  p_channel_id uuid,
  p_message_id uuid
)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member public.channel_members%rowtype;
  v_message public.messages%rowtype;
begin
  v_member := public.require_authenticated_channel_member(p_channel_id);

  update public.messages as message
  set content = 'This message was deleted.',
      deleted_at = now()
  where message.id = p_message_id
    and message.channel_id = p_channel_id
    and message.sender_id = v_member.id
    and message.deleted_at is null
  returning message.* into v_message;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only the message owner can delete an active message.';
  end if;

  delete from public.message_reactions as reaction
  where reaction.channel_id = p_channel_id
    and reaction.message_id = p_message_id;

  return v_message;
end;
$$;

create function public.toggle_authenticated_channel_message_reaction(
  p_channel_id uuid,
  p_message_id uuid,
  p_emoji text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member public.channel_members%rowtype;
  v_reaction public.message_reactions%rowtype;
begin
  v_member := public.require_authenticated_channel_member(p_channel_id);

  if p_emoji is null or char_length(p_emoji) < 1 or char_length(p_emoji) > 16 then
    raise exception using
      errcode = '22023',
      message = 'Reaction emoji must contain between 1 and 16 characters.';
  end if;

  if not exists (
    select 1
    from public.messages as message
    where message.id = p_message_id
      and message.channel_id = p_channel_id
      and message.deleted_at is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'The message is unavailable.';
  end if;

  select reaction.*
  into v_reaction
  from public.message_reactions as reaction
  where reaction.message_id = p_message_id
    and reaction.channel_member_id = v_member.id
  for update;

  if not found then
    insert into public.message_reactions (
      channel_id,
      message_id,
      channel_member_id,
      emoji
    )
    values (
      p_channel_id,
      p_message_id,
      v_member.id,
      p_emoji
    )
    on conflict (message_id, channel_member_id)
    do update set
      emoji = excluded.emoji,
      updated_at = now();
    return true;
  end if;

  if v_reaction.emoji = p_emoji then
    delete from public.message_reactions
    where id = v_reaction.id;
    return false;
  end if;

  update public.message_reactions
  set emoji = p_emoji,
      updated_at = now()
  where id = v_reaction.id;
  return true;
end;
$$;

-- Preserve direct RLS reads for history and Realtime, but keep all raw table
-- mutations closed. Browser writes are limited to the identity-bound RPCs.
revoke insert, update, delete, truncate, references, trigger
  on table public.messages, public.message_reactions
  from authenticated;
grant select on table public.messages, public.message_reactions to authenticated;

revoke all on function public.join_authenticated_channel_chat(uuid)
  from public, anon, authenticated;
revoke all on function public.list_authenticated_channel_chat_members(uuid)
  from public, anon, authenticated;
revoke all on function public.create_authenticated_channel_message(uuid, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.edit_authenticated_channel_message(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.delete_authenticated_channel_message(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.toggle_authenticated_channel_message_reaction(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.join_authenticated_channel_chat(uuid) to authenticated;
grant execute on function public.list_authenticated_channel_chat_members(uuid) to authenticated;
grant execute on function public.create_authenticated_channel_message(uuid, text, uuid, uuid)
  to authenticated;
grant execute on function public.edit_authenticated_channel_message(uuid, uuid, text)
  to authenticated;
grant execute on function public.delete_authenticated_channel_message(uuid, uuid)
  to authenticated;
grant execute on function public.toggle_authenticated_channel_message_reaction(uuid, uuid, text)
  to authenticated;

commit;
