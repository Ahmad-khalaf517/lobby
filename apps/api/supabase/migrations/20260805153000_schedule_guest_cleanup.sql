-- Enable Supabase Cron / pg_cron.
create extension if not exists pg_cron with schema pg_catalog;

-- Every 5 minutes:
-- End channels that:
--   1. reached expires_at, or
--   2. have been empty for at least 15 minutes.
select cron.schedule(
  'guest-expire-due-channels',
  '*/5 * * * *',
  $cron$
    select guest.expire_due_channels(15);
  $cron$
);

-- Every 15 minutes:
-- Permanently delete channels that have been ended or expired
-- for at least 60 minutes.
select cron.schedule(
  'guest-purge-ended-channels',
  '*/15 * * * *',
  $cron$
    select guest.purge_ended_channels(60);
  $cron$
);