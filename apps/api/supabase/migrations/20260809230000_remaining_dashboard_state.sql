begin;

-- Durable per-participant DM state. Clearing a chat advances only the
-- caller's visibility boundary; it never deletes the other participant's
-- history. Read timestamps make unread counts survive reloads and devices.
alter table public.dm_conversations
  add column if not exists user_a_last_read_at timestamptz,
  add column if not exists user_b_last_read_at timestamptz,
  add column if not exists user_a_cleared_at timestamptz,
  add column if not exists user_b_cleared_at timestamptz;

alter table public.dm_messages
  add column if not exists edited_at timestamptz,
  add column if not exists reaction_user_id uuid,
  add column if not exists client_message_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dm_messages_reaction_user_id_fkey'
      and conrelid = 'public.dm_messages'::regclass
  ) then
    alter table public.dm_messages
      add constraint dm_messages_reaction_user_id_fkey
      foreign key (reaction_user_id)
      references public.users(id)
      on update cascade
      on delete set null;
  end if;
end
$$;

create index if not exists dm_messages_conversation_created_at_idx
  on public.dm_messages(conversation_id, created_at desc);
create index if not exists dm_messages_reaction_user_id_idx
  on public.dm_messages(reaction_user_id);
create unique index if not exists dm_messages_sender_client_message_id_key
  on public.dm_messages(sender_id, client_message_id)
  where client_message_id is not null;

create or replace function public.require_dm_participant(p_conversation_id uuid)
returns public.dm_conversations
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conversation public.dm_conversations%rowtype;
begin
  if auth.uid() is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '42501', message = 'A registered account is required.';
  end if;

  select conversation.* into v_conversation
  from public.dm_conversations as conversation
  where conversation.id = p_conversation_id
    and auth.uid() in (conversation.user_a_id, conversation.user_b_id);

  if not found then
    raise exception using errcode = '42501', message = 'Conversation participation is required.';
  end if;
  return v_conversation;
end;
$$;

create or replace function public.create_dm_message(
  p_conversation_id uuid,
  p_content text,
  p_client_message_id uuid,
  p_reply_to uuid default null
)
returns public.dm_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conversation public.dm_conversations%rowtype;
  v_message public.dm_messages%rowtype;
  v_content text := btrim(p_content);
begin
  v_conversation := public.require_dm_participant(p_conversation_id);
  if exists (
    select 1
    from public.friendships as friendship
    where friendship.status = 'blocked'
      and (
        (friendship.requester_id = v_conversation.user_a_id
          and friendship.addressee_id = v_conversation.user_b_id)
        or
        (friendship.requester_id = v_conversation.user_b_id
          and friendship.addressee_id = v_conversation.user_a_id)
      )
  ) then
    raise exception using errcode = '42501', message = 'You cannot message this user.';
  end if;
  if v_content is null or char_length(v_content) < 1 or char_length(v_content) > 2000 then
    raise exception using errcode = '22023', message = 'Message content must contain between 1 and 2000 characters.';
  end if;
  if p_client_message_id is null then
    raise exception using errcode = '22023', message = 'A client message id is required.';
  end if;
  if p_reply_to is not null and not exists (
    select 1 from public.dm_messages as reply
    where reply.id = p_reply_to and reply.conversation_id = p_conversation_id
  ) then
    raise exception using errcode = '22023', message = 'The reply target is unavailable.';
  end if;

  insert into public.dm_messages (
    conversation_id, sender_id, content, reply_to, client_message_id
  ) values (
    p_conversation_id, auth.uid(), v_content, p_reply_to, p_client_message_id
  )
  on conflict (sender_id, client_message_id) where client_message_id is not null do nothing
  returning * into v_message;

  if not found then
    select message.* into v_message from public.dm_messages as message
    where message.sender_id = auth.uid()
      and message.client_message_id = p_client_message_id;
  end if;

  update public.dm_conversations
  set updated_at = now()
  where id = p_conversation_id;
  return v_message;
end;
$$;

create or replace function public.edit_dm_message(
  p_conversation_id uuid,
  p_message_id uuid,
  p_content text
)
returns public.dm_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_message public.dm_messages%rowtype;
  v_content text := btrim(p_content);
begin
  perform public.require_dm_participant(p_conversation_id);
  if v_content is null or char_length(v_content) < 1 or char_length(v_content) > 2000 then
    raise exception using errcode = '22023', message = 'Message content must contain between 1 and 2000 characters.';
  end if;
  update public.dm_messages as message
  set content = v_content, edited_at = now()
  where message.id = p_message_id
    and message.conversation_id = p_conversation_id
    and message.sender_id = auth.uid()
  returning message.* into v_message;
  if not found then
    raise exception using errcode = '42501', message = 'Only the message owner can edit it.';
  end if;
  return v_message;
end;
$$;

create or replace function public.delete_dm_message(
  p_conversation_id uuid,
  p_message_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_dm_participant(p_conversation_id);
  delete from public.dm_messages as message
  where message.id = p_message_id
    and message.conversation_id = p_conversation_id
    and message.sender_id = auth.uid();
  if not found then
    raise exception using errcode = '42501', message = 'Only the message owner can delete it.';
  end if;
  return p_message_id;
end;
$$;

create or replace function public.toggle_dm_message_reaction(
  p_conversation_id uuid,
  p_message_id uuid,
  p_emoji text
)
returns public.dm_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_message public.dm_messages%rowtype;
begin
  perform public.require_dm_participant(p_conversation_id);
  if p_emoji is null or char_length(p_emoji) < 1 or char_length(p_emoji) > 16 then
    raise exception using errcode = '22023', message = 'Reaction emoji must contain between 1 and 16 characters.';
  end if;
  update public.dm_messages as message
  set reaction_emoji = case
        when message.reaction_user_id = auth.uid() and message.reaction_emoji = p_emoji then null
        else p_emoji
      end,
      reaction_user_id = case
        when message.reaction_user_id = auth.uid() and message.reaction_emoji = p_emoji then null
        else auth.uid()
      end
  where message.id = p_message_id
    and message.conversation_id = p_conversation_id
  returning message.* into v_message;
  if not found then
    raise exception using errcode = '22023', message = 'The message is unavailable.';
  end if;
  return v_message;
end;
$$;

create or replace function public.mark_dm_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conversation public.dm_conversations%rowtype;
begin
  v_conversation := public.require_dm_participant(p_conversation_id);
  if v_conversation.user_a_id = auth.uid() then
    update public.dm_conversations set user_a_last_read_at = now() where id = p_conversation_id;
  else
    update public.dm_conversations set user_b_last_read_at = now() where id = p_conversation_id;
  end if;
end;
$$;

create or replace function public.clear_dm_conversation(p_conversation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conversation public.dm_conversations%rowtype;
begin
  v_conversation := public.require_dm_participant(p_conversation_id);
  if v_conversation.user_a_id = auth.uid() then
    update public.dm_conversations
    set user_a_cleared_at = now(), user_a_last_read_at = now()
    where id = p_conversation_id;
  else
    update public.dm_conversations
    set user_b_cleared_at = now(), user_b_last_read_at = now()
    where id = p_conversation_id;
  end if;
end;
$$;

-- DELETE/UPDATE payloads need enough old-row identity for clients to
-- reconcile their own RLS-visible state safely.
alter table public.dm_messages replica identity full;
alter table public.dm_conversations replica identity full;
alter table public.friendships replica identity full;
alter table public.notifications replica identity full;
alter table public.server_members replica identity full;

alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.server_members enable row level security;

-- Replace legacy policies on these browser-readable tables so no broader
-- authenticated/anon policy survives alongside the strict policies below.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'dm_conversations', 'dm_messages', 'friendships', 'notifications', 'server_members'
      )
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

create policy dm_conversations_select_participant
on public.dm_conversations
for select
to authenticated
using (
  auth.uid() is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and auth.uid() in (user_a_id, user_b_id)
);

create policy dm_messages_select_participant
on public.dm_messages
for select
to authenticated
using (
  auth.uid() is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and exists (
    select 1
    from public.dm_conversations as conversation
    where conversation.id = dm_messages.conversation_id
      and auth.uid() in (conversation.user_a_id, conversation.user_b_id)
  )
);

create policy friendships_select_participant
on public.friendships
for select
to authenticated
using (
  auth.uid() is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and auth.uid() in (requester_id, addressee_id)
);

create policy notifications_select_self
on public.notifications
for select
to authenticated
using (
  auth.uid() is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and user_id = auth.uid()
);

create policy notifications_update_read_state_self
on public.notifications
for update
to authenticated
using (
  auth.uid() is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and user_id = auth.uid()
)
with check (user_id = auth.uid());

create policy server_members_select_self
on public.server_members
for select
to authenticated
using (
  auth.uid() is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and user_id = auth.uid()
);

revoke all on table
  public.dm_conversations,
  public.dm_messages,
  public.friendships,
  public.notifications,
  public.server_members
from anon, authenticated;

grant select on table
  public.dm_conversations,
  public.dm_messages,
  public.friendships,
  public.notifications,
  public.server_members
to authenticated;

grant update (is_read, read_at)
on public.notifications
to authenticated;

revoke all on function public.require_dm_participant(uuid) from public, anon, authenticated;
revoke all on function public.create_dm_message(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.edit_dm_message(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.delete_dm_message(uuid, uuid) from public, anon, authenticated;
revoke all on function public.toggle_dm_message_reaction(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_dm_conversation_read(uuid) from public, anon, authenticated;
revoke all on function public.clear_dm_conversation(uuid) from public, anon, authenticated;

grant execute on function public.create_dm_message(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.edit_dm_message(uuid, uuid, text) to authenticated;
grant execute on function public.delete_dm_message(uuid, uuid) to authenticated;
grant execute on function public.toggle_dm_message_reaction(uuid, uuid, text) to authenticated;
grant execute on function public.mark_dm_conversation_read(uuid) to authenticated;
grant execute on function public.clear_dm_conversation(uuid) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'dm_conversations',
    'dm_messages',
    'friendships',
    'notifications',
    'server_members'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;

commit;
