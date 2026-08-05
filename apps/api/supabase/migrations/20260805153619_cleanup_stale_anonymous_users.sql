-- Remove abandoned Supabase Anonymous Auth users after guest-channel data is gone.
--
-- Safety rules:
--   1. Only auth.users rows with is_anonymous = true are eligible.
--   2. Users younger than the retention period are preserved.
--   3. Users with any remaining guest.channel_members row are preserved.
--   4. Deletion is batched so the daily cron job remains lightweight.
--
-- This migration assumes guest.channel_members.user_id references auth.users(id).

create or replace function guest.cleanup_stale_anonymous_users(
  p_retention interval default interval '7 days',
  p_batch_size integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_count integer := 0;
begin
  if p_retention is null
    or p_retention < interval '1 day'
    or p_retention > interval '365 days'
  then
    raise exception using
      errcode = '22023',
      message = 'Retention must be between 1 and 365 days.';
  end if;

  if p_batch_size is null
    or p_batch_size < 1
    or p_batch_size > 5000
  then
    raise exception using
      errcode = '22023',
      message = 'Batch size must be between 1 and 5000.';
  end if;

  with stale_users as (
    select auth_user.id
    from auth.users as auth_user
    where auth_user.is_anonymous is true
      and auth_user.created_at < pg_catalog.now() - p_retention
      and not exists (
        select 1
        from guest.channel_members as member
        where member.user_id = auth_user.id
      )
    order by auth_user.created_at asc
    limit p_batch_size
    for update skip locked
  ),
  deleted_users as (
    delete from auth.users as auth_user
    using stale_users
    where auth_user.id = stale_users.id
    returning auth_user.id
  )
  select pg_catalog.count(*)::integer
  into v_deleted_count
  from deleted_users;

  return v_deleted_count;
end;
$$;

comment on function guest.cleanup_stale_anonymous_users(interval, integer) is
  'Deletes old Supabase anonymous Auth users that no longer have guest channel memberships.';

-- Keep this maintenance function unavailable to browser roles.
revoke all
on function guest.cleanup_stale_anonymous_users(interval, integer)
from public, anon, authenticated;

-- Optional trusted manual execution through a service-role client.
grant execute
on function guest.cleanup_stale_anonymous_users(interval, integer)
to service_role;

-- Supabase Cron uses pg_cron. The extension may already exist from the
-- guest-channel cleanup migration; IF NOT EXISTS keeps this migration safe.
create extension if not exists pg_cron with schema pg_catalog;

-- Run once per day at 03:20 UTC.
-- Scheduling with the same name updates/replaces the existing job.
select cron.schedule(
  'guest-cleanup-stale-anonymous-users',
  '20 3 * * *',
  $cron$
    select guest.cleanup_stale_anonymous_users(interval '7 days', 1000);
  $cron$
);