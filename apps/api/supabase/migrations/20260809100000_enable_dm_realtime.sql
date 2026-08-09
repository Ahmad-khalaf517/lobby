-- ---------------------------------------------------------------------
-- DMs & friendships realtime access
--
-- The DM/friendship/notification tables are written exclusively by the
-- NestJS API using the service-role key (which bypasses RLS). The Angular
-- app reads them only via Supabase Realtime subscriptions, and Realtime
-- only delivers rows the subscribing user can SELECT. These policies give
-- participants read access to their own conversations, friendships, and
-- notifications, then publish the tables so postgres_changes events flow.
--
-- Run this with `supabase db push` or paste it into the SQL editor once
-- (it is idempotent).
-- ---------------------------------------------------------------------

-- dm_conversations: a user can see conversations they belong to.
ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dm_conversations_participant_select" ON public.dm_conversations;
CREATE POLICY "dm_conversations_participant_select"
  ON public.dm_conversations
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (user_a_id, user_b_id));

-- dm_messages: a user can see messages in conversations they belong to.
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dm_messages_participant_select" ON public.dm_messages;
CREATE POLICY "dm_messages_participant_select"
  ON public.dm_messages
  FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.dm_conversations
      WHERE auth.uid() IN (user_a_id, user_b_id)
    )
  );

-- friendships: a user can see relationships they are part of.
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "friendships_participant_select" ON public.friendships;
CREATE POLICY "friendships_participant_select"
  ON public.friendships
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (requester_id, addressee_id));

-- notifications: a user can only see their own notifications.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_owner_select" ON public.notifications;
CREATE POLICY "notifications_owner_select"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Publish the tables so Realtime emits postgres_changes events for them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_conversations') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_conversations;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;
