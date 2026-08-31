-- Moderator can delete the exact reported target. Target IDs come only from
-- content_reports. Shared media assets are not deleted here; the last active
-- nix reference is marked deleting for cleanup-media-upload-orphans.

CREATE OR REPLACE FUNCTION public.moderation_remove_reported_content(p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  report_nix UUID;
  report_text UUID;
  target_asset UUID;
  deleted_anything BOOLEAN := FALSE;
BEGIN
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  SELECT r.nix_id, r.text_message_id
    INTO report_nix, report_text
  FROM public.content_reports r
  WHERE r.id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  IF report_nix IS NULL AND report_text IS NULL THEN
    RETURN;
  END IF;

  IF report_text IS NOT NULL THEN
    DELETE FROM public.text_messages tm
    WHERE tm.id = report_text;
    IF FOUND THEN
      deleted_anything := TRUE;
    END IF;
  END IF;

  IF report_nix IS NOT NULL THEN
    SELECT n.asset_id
      INTO target_asset
    FROM public.nixes n
    WHERE n.id = report_nix;

    IF target_asset IS NOT NULL THEN
      PERFORM 1
      FROM public.media_assets a
      WHERE a.id = target_asset
      FOR UPDATE;
    END IF;

    DELETE FROM public.nixes n
    WHERE n.id = report_nix;
    IF FOUND THEN
      deleted_anything := TRUE;
    END IF;

    IF target_asset IS NOT NULL THEN
      UPDATE public.media_assets a
      SET status = 'deleting'
      WHERE a.id = target_asset
        AND a.status <> 'deleted'
        AND NOT EXISTS (
          SELECT 1
          FROM public.nixes n
          WHERE n.asset_id = a.id
            AND n.status IN ('sent', 'viewed', 'cleanup_failed')
        );
    END IF;
  END IF;

  IF deleted_anything THEN
    INSERT INTO moderation.report_audit(report_id, action, note)
    VALUES (p_report_id, 'content_removed', NULL);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_remove_reported_content(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_remove_reported_content(UUID) TO service_role;
