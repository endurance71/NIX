-- Fail fast instead of queueing behind a long transaction on hot tables (retry the push).
SET lock_timeout = '5s';

-- Chat NiX history with one peer as two ordered index branches (audit DB-10
-- follow-up, 2026-10-11).
--
-- The client used to read the chat NiX list with one PostgREST filter:
--   (sender_id = me AND receiver_id = peer) OR (sender_id = peer AND receiver_id = me)
--   ORDER BY created_at DESC LIMIT n
-- idx_nixes_pair_created_at (sender_id, receiver_id, created_at DESC) cannot
-- serve that OR as one ordered scan, so the planner reads every row of both
-- directions (bitmap OR) and sorts them before applying the limit. This RPC
-- runs each direction as its own `ORDER BY created_at DESC LIMIT n` index scan
-- and merges at most 2 × n rows.
--
-- Security model: SECURITY INVOKER with an empty search_path. Rows are read
-- through the caller's grants and the nixes_select policy, so pair blocks and
-- account restriction apply exactly as for the old direct query. The function
-- adds no privilege.
--
-- Columns mirror fetchChatNixesWithPeer in src/services/nixService.ts.
-- thumbnail_b64 is intentionally absent (up to ~60 KB per row). The limit is
-- clamped to 1..100 like the client.

CREATE OR REPLACE FUNCTION public.get_chat_nixes_with_peer(
  p_peer_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  receiver_id UUID,
  created_at TIMESTAMPTZ,
  media_path TEXT,
  media_type TEXT,
  is_viewed BOOLEAN,
  is_replayed BOOLEAN,
  replay_expires_at TIMESTAMPTZ,
  status TEXT,
  view_duration_sec INTEGER,
  playback_duration_ms INTEGER,
  client_upload_id TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
-- The nixes_select policy adds `(uid = sender_id OR uid = receiver_id)` with
-- uid as an init plan, so the planner underestimates each branch (~3 rows)
-- and picks a BitmapOr + top-N sort over every row of the pair, evaluating
-- is_pair_blocked per row. With explicit sorts disabled the cheapest plan is
-- the ordered idx_nixes_pair_created_at scan (plus an incremental sort on the
-- id tie-breaker) that stops after p_limit rows. enable_sort is used instead
-- of enable_bitmapscan because it leaves the BitmapOr lookup inside
-- private.is_pair_blocked (user_blocks) untouched; neither nested helper
-- sorts. The final ORDER BY is a Merge Append of the two sorted branches.
SET enable_sort = off
AS $$
  SELECT
    c.id, c.sender_id, c.receiver_id, c.created_at, c.media_path, c.media_type,
    c.is_viewed, c.is_replayed, c.replay_expires_at, c.status,
    c.view_duration_sec, c.playback_duration_ms, c.client_upload_id
  FROM (
    (
      SELECT
        n.id, n.sender_id, n.receiver_id, n.created_at, n.media_path, n.media_type,
        n.is_viewed, n.is_replayed, n.replay_expires_at, n.status,
        n.view_duration_sec, n.playback_duration_ms, n.client_upload_id
      FROM public.nixes n
      WHERE n.sender_id = (SELECT auth.uid())
        AND n.receiver_id = p_peer_id
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    )
    UNION ALL
    (
      -- A self-addressed conversation is fully covered by the first branch.
      SELECT
        n.id, n.sender_id, n.receiver_id, n.created_at, n.media_path, n.media_type,
        n.is_viewed, n.is_replayed, n.replay_expires_at, n.status,
        n.view_duration_sec, n.playback_duration_ms, n.client_upload_id
      FROM public.nixes n
      WHERE n.sender_id = p_peer_id
        AND n.receiver_id = (SELECT auth.uid())
        AND n.sender_id IS DISTINCT FROM (SELECT auth.uid())
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    )
  ) c
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

COMMENT ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) IS
  'Newest NiXes between the caller and one peer (both directions, no thumbnail_b64). Two index-ordered branches over idx_nixes_pair_created_at. SECURITY INVOKER: relies on nixes_select RLS.';

REVOKE ALL ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_chat_nixes_with_peer(UUID, INTEGER) TO authenticated;
