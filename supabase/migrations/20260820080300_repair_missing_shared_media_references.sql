-- Preserve the previous state of shared-media rows whose Storage object is
-- already gone, then remove those dead references from every unread queue.
-- The audit table deliberately omits sender/receiver identifiers and lives in
-- the non-exposed private schema.

CREATE TABLE IF NOT EXISTS private.missing_shared_media_repair_audit (
  repair_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repaired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nix_id UUID NOT NULL UNIQUE,
  asset_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  media_type TEXT,
  previous_status TEXT NOT NULL,
  previous_is_viewed BOOLEAN,
  previous_is_replayed BOOLEAN NOT NULL,
  previous_viewed_at TIMESTAMPTZ,
  previous_replay_expires_at TIMESTAMPTZ,
  previous_cleaned_at TIMESTAMPTZ
);

REVOKE ALL ON TABLE private.missing_shared_media_repair_audit
  FROM PUBLIC, anon, authenticated;

WITH missing_active_nixes AS (
  SELECT
    n.id AS nix_id,
    n.asset_id,
    a.storage_path,
    n.media_type,
    n.status,
    n.is_viewed,
    n.is_replayed,
    n.viewed_at,
    n.replay_expires_at,
    n.cleaned_at
  FROM public.nixes n
  JOIN public.media_assets a ON a.id = n.asset_id
  LEFT JOIN storage.objects o
    ON o.bucket_id = 'media-vault'
   AND o.name = a.storage_path
  WHERE n.asset_id IS NOT NULL
    AND n.status IN ('sent', 'viewed', 'cleanup_failed')
    AND o.id IS NULL
  FOR UPDATE OF n, a
), audit_insert AS (
  INSERT INTO private.missing_shared_media_repair_audit (
    nix_id,
    asset_id,
    storage_path,
    media_type,
    previous_status,
    previous_is_viewed,
    previous_is_replayed,
    previous_viewed_at,
    previous_replay_expires_at,
    previous_cleaned_at
  )
  SELECT
    nix_id,
    asset_id,
    storage_path,
    media_type,
    status,
    is_viewed,
    is_replayed,
    viewed_at,
    replay_expires_at,
    cleaned_at
  FROM missing_active_nixes
  ON CONFLICT (nix_id) DO NOTHING
  RETURNING nix_id
)
UPDATE public.nixes n
SET
  is_viewed = TRUE,
  viewed_at = COALESCE(n.viewed_at, NOW()),
  status = 'cleaned',
  cleaned_at = COALESCE(n.cleaned_at, NOW()),
  replay_expires_at = NULL,
  is_replayed = TRUE
WHERE n.id IN (SELECT nix_id FROM missing_active_nixes);

DELETE FROM public.nix_cleanup_queue q
USING private.missing_shared_media_repair_audit audit
WHERE q.nix_id = audit.nix_id;

UPDATE public.media_assets a
SET
  status = 'deleted',
  deleted_at = COALESCE(a.deleted_at, NOW())
WHERE a.id IN (
  SELECT DISTINCT audit.asset_id
  FROM private.missing_shared_media_repair_audit audit
)
AND NOT EXISTS (
  SELECT 1
  FROM public.nixes n
  WHERE n.asset_id = a.id
    AND n.status IN ('sent', 'viewed', 'cleanup_failed')
)
AND NOT EXISTS (
  SELECT 1
  FROM storage.objects o
  WHERE o.bucket_id = 'media-vault'
    AND o.name = a.storage_path
);
