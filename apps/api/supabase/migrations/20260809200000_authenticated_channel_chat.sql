begin;

-- Client-generated UUIDs make retries idempotent without exposing database ids
-- or allowing the browser to write directly.
alter table public.messages
  add column client_message_id uuid;

create unique index messages_sender_client_message_id_key
  on public.messages(sender_id, client_message_id)
  where client_message_id is not null;

-- Reactions need their channel on the row so Realtime subscriptions can be
-- filtered to one active channel. Preflight found no existing reaction rows,
-- but keep the backfill correct for forward migration safety.
alter table public.message_reactions
  add column channel_id uuid;

update public.message_reactions as reaction
set channel_id = message.channel_id
from public.messages as message
where message.id = reaction.message_id;

alter table public.message_reactions
  alter column channel_id set not null;

-- Enforce that message senders and reaction actors belong to the same channel
-- as the row they are writing.
alter table public.channel_members
  add constraint channel_members_channel_id_id_key
  unique (channel_id, id);

alter table public.messages
  add constraint messages_channel_id_id_key
  unique (channel_id, id),
  drop constraint messages_sender_id_fkey,
  add constraint messages_sender_id_fkey
  foreign key (channel_id, sender_id)
  references public.channel_members(channel_id, id)
  on update cascade
  on delete cascade;

alter table public.message_reactions
  drop constraint message_reactions_message_id_fkey,
  drop constraint message_reactions_channel_member_id_fkey,
  add constraint message_reactions_message_id_fkey
  foreign key (channel_id, message_id)
  references public.messages(channel_id, id)
  on update cascade
  on delete cascade,
  add constraint message_reactions_channel_member_id_fkey
  foreign key (channel_id, channel_member_id)
  references public.channel_members(channel_id, id)
  on update cascade
  on delete cascade;

create index message_reactions_channel_id_idx
  on public.message_reactions(channel_id);

-- Browser access remains read-only. This SECURITY DEFINER helper lets RLS
-- verify server membership without granting raw SELECT on channels or
-- server_members. Anonymous Supabase sessions are explicitly excluded.
create function public.is_authenticated_channel_member(target_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and exists (
      select 1
      from public.channels as channel
      join public.server_members as member
        on member.server_id = channel.server_id
      where channel.id = target_channel_id
        and member.user_id = auth.uid()
    );
$$;

revoke all on function public.is_authenticated_channel_member(uuid) from public, anon;
grant execute on function public.is_authenticated_channel_member(uuid) to authenticated;

create policy authenticated_channel_messages_select
on public.messages
for select
to authenticated
using (public.is_authenticated_channel_member(channel_id));

create policy authenticated_channel_reactions_select
on public.message_reactions
for select
to authenticated
using (public.is_authenticated_channel_member(channel_id));

grant select on table public.messages, public.message_reactions to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end
$$;

commit;
