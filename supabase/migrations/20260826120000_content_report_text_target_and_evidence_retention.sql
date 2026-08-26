-- Expand only: text message report target, backfill evidence expiry, RPC v2,
-- and orphan inventory. Do NOT add content_reports_evidence_requires_expiry
-- here — a live report-content v1 would upload evidence then fail the path
-- update, leaving Storage orphans. CHECK + drop v1 ship in a separate
-- follow-up PR after Edge Function v2 is deployed and smoke-tested.
-- See docs/plans/2026-08-26-content-report-contract-followup.md.

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS text_message_id UUID REFERENCES public.text_messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_reports_reporter_text_message_unique
  ON public.content_reports(reporter_id, text_message_id)
  WHERE text_message_id IS NOT NULL AND reporter_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_reports_single_content_target'
      AND conrelid = 'public.content_reports'::regclass
  ) THEN
    ALTER TABLE public.content_reports
      ADD CONSTRAINT content_reports_single_content_target
      CHECK (NOT (nix_id IS NOT NULL AND text_message_id IS NOT NULL));
  END IF;
END
$$;

UPDATE public.content_reports
SET evidence_expires_at = created_at + INTERVAL '30 days'
WHERE evidence_path IS NOT NULL
  AND evidence_expires_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_content_report_v2(
  p_reason TEXT,
  p_nix_id UUID DEFAULT NULL,
  p_text_message_id UUID DEFAULT NULL,
  p_reported_user_id UUID DEFAULT NULL,
  p_details TEXT DEFAULT NULL
)
RETURNS TABLE(
  report_id UUID,
  media_path TEXT,
  media_type TEXT,
  reported_user_id UUID,
  evidence_expires_at TIMESTAMPTZ,
  text_message_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  has_nix BOOLEAN := p_nix_id IS NOT NULL;
  has_text BOOLEAN := p_text_message_id IS NOT NULL;
  has_user BOOLEAN := p_reported_user_id IS NOT NULL AND p_text_message_id IS NULL;
  target_user UUID;
  target_media_path TEXT;
  target_media_type TEXT;
  target_text_id UUID := NULL;
  existing_report UUID;
  new_report_id UUID;
  report_priority TEXT;
  expiry TIMESTAMPTZ;
  message_sender UUID;
  message_receiver UUID;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_reason NOT IN (
    'sexual_content', 'violence', 'self_harm', 'harassment', 'hate',
    'impersonation', 'spam', 'privacy', 'illegal_content', 'other'
  ) THEN
    RAISE EXCEPTION 'Invalid report reason';
  END IF;
  IF p_details IS NOT NULL AND char_length(p_details) > 500 THEN
    RAISE EXCEPTION 'Report details are too long';
  END IF;
  IF (has_nix::INT + has_text::INT + has_user::INT) <> 1 THEN
    RAISE EXCEPTION 'Invalid report target';
  END IF;

  IF has_text THEN
    SELECT tm.sender_id, tm.receiver_id
      INTO message_sender, message_receiver
    FROM public.text_messages tm
    WHERE tm.id = p_text_message_id;

    IF message_sender IS NULL OR message_receiver IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'Message is not reportable';
    END IF;
    IF p_reported_user_id IS NOT NULL AND p_reported_user_id IS DISTINCT FROM message_sender THEN
      RAISE EXCEPTION 'Invalid legacy reported user';
    END IF;

    target_user := message_sender;
    target_text_id := p_text_message_id;
    expiry := NOW() + INTERVAL '30 days';

    SELECT r.id INTO existing_report
    FROM public.content_reports r
    WHERE r.reporter_id = actor_id AND r.text_message_id = p_text_message_id
    LIMIT 1;
  ELSIF has_nix THEN
    SELECT n.sender_id, n.media_path, n.media_type
      INTO target_user, target_media_path, target_media_type
    FROM public.nixes n
    WHERE n.id = p_nix_id AND n.receiver_id = actor_id;

    IF target_user IS NULL THEN
      RAISE EXCEPTION 'Message is not reportable';
    END IF;

    expiry := NOW() + INTERVAL '30 days';

    SELECT r.id INTO existing_report
    FROM public.content_reports r
    WHERE r.reporter_id = actor_id AND r.nix_id = p_nix_id
    LIMIT 1;
  ELSE
    target_user := p_reported_user_id;
    IF target_user = actor_id OR NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = target_user
    ) THEN
      RAISE EXCEPTION 'User is not reportable';
    END IF;
  END IF;

  IF existing_report IS NOT NULL THEN
    RETURN QUERY
    SELECT r.id,
           target_media_path,
           target_media_type,
           r.reported_user_id,
           r.evidence_expires_at,
           r.text_message_id
    FROM public.content_reports r
    WHERE r.id = existing_report;
    RETURN;
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.content_reports r
    WHERE r.reporter_id = actor_id
      AND r.created_at > NOW() - INTERVAL '24 hours'
  ) >= 20 THEN
    RAISE EXCEPTION 'Report rate limit exceeded';
  END IF;

  report_priority := CASE
    WHEN p_reason IN ('violence', 'self_harm', 'illegal_content') THEN 'critical'
    ELSE 'normal'
  END;

  BEGIN
    INSERT INTO public.content_reports(
      reporter_id,
      reported_user_id,
      nix_id,
      text_message_id,
      reason,
      details,
      priority,
      evidence_expires_at
    ) VALUES (
      actor_id,
      target_user,
      p_nix_id,
      target_text_id,
      p_reason,
      NULLIF(trim(p_details), ''),
      report_priority,
      expiry
    )
    RETURNING id INTO new_report_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT r.id INTO existing_report
    FROM public.content_reports r
    WHERE r.reporter_id = actor_id
      AND (
        (p_nix_id IS NOT NULL AND r.nix_id = p_nix_id)
        OR (p_text_message_id IS NOT NULL AND r.text_message_id = p_text_message_id)
      )
    LIMIT 1;

    RETURN QUERY
    SELECT r.id,
           target_media_path,
           target_media_type,
           r.reported_user_id,
           r.evidence_expires_at,
           r.text_message_id
    FROM public.content_reports r
    WHERE r.id = existing_report;
    RETURN;
  END;

  INSERT INTO moderation.report_audit(report_id, action, note)
  VALUES (new_report_id, 'created', NULL);

  RETURN QUERY
  SELECT new_report_id,
         target_media_path,
         target_media_type,
         target_user,
         expiry,
         target_text_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_moderation_evidence_orphans()
RETURNS TABLE(object_name TEXT, created_at TIMESTAMPTZ, eligible BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.name,
         o.created_at,
         (o.created_at < NOW() - INTERVAL '24 hours')
  FROM storage.objects o
  WHERE o.bucket_id = 'moderation-evidence'
    AND NOT EXISTS (
      SELECT 1
      FROM public.content_reports r
      WHERE r.evidence_path = o.name
    )
  ORDER BY o.created_at ASC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.create_content_report_v2(TEXT, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_content_report_v2(TEXT, UUID, UUID, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.list_moderation_evidence_orphans() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_moderation_evidence_orphans() TO service_role;
