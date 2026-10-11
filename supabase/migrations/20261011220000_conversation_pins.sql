-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Pinned inbox conversations: a private, per-user preference synced across the user's devices.
--
-- A separate owner-only table (not a column on a shared row) so a pin is never visible to the
-- pinned peer. Clients degrade to device-local storage when this table is not deployed yet.

CREATE TABLE IF NOT EXISTS public.conversation_pins (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  peer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_id),
  CONSTRAINT conversation_pins_not_self CHECK (user_id <> peer_id)
);

COMMENT ON TABLE public.conversation_pins IS
  'Private inbox pins. Owner-only via RLS; order = pinned_at ascending.';

-- The primary key covers owner lookups; this index serves the peer-side FK cascade.
CREATE INDEX IF NOT EXISTS idx_conversation_pins_peer_id
  ON public.conversation_pins (peer_id);

ALTER TABLE public.conversation_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conversation_pins FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversation_pins TO authenticated;

DROP POLICY IF EXISTS conversation_pins_owner ON public.conversation_pins;
CREATE POLICY conversation_pins_owner
  ON public.conversation_pins FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
