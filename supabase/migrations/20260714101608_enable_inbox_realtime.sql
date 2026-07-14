-- Enable the authenticated inbox tables for Postgres Changes. RLS remains the
-- authorization boundary for every subscriber. The guards keep this migration
-- safe when a table was enabled manually in the dashboard before deployment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'nixes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.nixes;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'friendships'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
    END IF;
  END IF;
END
$$;
