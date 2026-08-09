begin;

create or replace function public.is_authenticated_channel_member(target_channel_id uuid)
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
      join public.server_members as server_member
        on server_member.server_id = channel.server_id
       and server_member.user_id = auth.uid()
      join public.channel_members as channel_member
        on channel_member.channel_id = channel.id
       and channel_member.user_id = auth.uid()
       and channel_member.left_at is null
       and channel_member.removed_at is null
      where channel.id = target_channel_id
    );
$$;

revoke all on function public.is_authenticated_channel_member(uuid) from public, anon;
grant execute on function public.is_authenticated_channel_member(uuid) to authenticated;

commit;
