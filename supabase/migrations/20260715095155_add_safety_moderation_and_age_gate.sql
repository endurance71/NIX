BEGIN;

-- NiX safety model for the external TestFlight beta.
-- Private conversations are not scanned automatically. A media object is copied
-- into the evidence bucket only after the receiver explicitly reports it.

CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS moderation;
REVOKE ALL ON SCHEMA private, moderation FROM PUBLIC, anon, authenticated;

-- Roll the age gate out safely. Existing clients outside the explicitly
-- managed QA cohort keep their current access until a compatible build is
-- available to everyone. Suspensions and bans remain global regardless of
-- this rollout mode.
CREATE TABLE private.safety_policy_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  age_gate_mode TEXT NOT NULL DEFAULT 'cohort' CHECK (age_gate_mode IN ('cohort', 'all')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO private.safety_policy_config(singleton, age_gate_mode)
VALUES (TRUE, 'cohort')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE private.safety_policy_cohort (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE private.safety_policy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.safety_policy_cohort ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.safety_policy_config, private.safety_policy_cohort
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.safety_policy_config, private.safety_policy_cohort TO service_role;

CREATE TABLE public.age_attestations (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  minimum_age SMALLINT NOT NULL DEFAULT 16 CHECK (minimum_age = 16),
  policy_version TEXT NOT NULL,
  attested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.age_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY age_attestations_select_own
  ON public.age_attestations FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.age_attestations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.age_attestations TO authenticated;
GRANT ALL ON public.age_attestations TO service_role;

CREATE TABLE public.user_blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX idx_user_blocks_blocked_id ON public.user_blocks(blocked_id, blocker_id);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_blocks_select_own
  ON public.user_blocks FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = blocker_id);

REVOKE ALL ON public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;

CREATE TABLE public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nix_id UUID REFERENCES public.nixes(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (
    reason IN ('sexual_content', 'violence', 'self_harm', 'harassment', 'hate', 'impersonation', 'spam', 'privacy', 'illegal_content', 'other')
  ),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'in_review', 'actioned', 'dismissed', 'escalated', 'evidence_failed')
  ),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'normal')),
  evidence_path TEXT,
  evidence_expires_at TIMESTAMPTZ,
  evidence_deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_content_reports_reporter_nix_unique
  ON public.content_reports(reporter_id, nix_id)
  WHERE nix_id IS NOT NULL AND reporter_id IS NOT NULL;
CREATE INDEX idx_content_reports_queue
  ON public.content_reports(status, priority, created_at);
CREATE INDEX idx_content_reports_evidence_expiry
  ON public.content_reports(evidence_expires_at)
  WHERE evidence_path IS NOT NULL AND evidence_deleted_at IS NULL;

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_reports_select_own
  ON public.content_reports FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = reporter_id);

REVOKE ALL ON public.content_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.content_reports TO authenticated;
GRANT ALL ON public.content_reports TO service_role;

CREATE TABLE moderation.account_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.content_reports(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('warning', 'suspension', 'ban')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT moderation_action_expiry CHECK (
    (action = 'suspension' AND expires_at IS NOT NULL)
    OR (action <> 'suspension' AND expires_at IS NULL)
  )
);

CREATE INDEX idx_moderation_actions_active_user
  ON moderation.account_actions(target_user_id, created_at DESC)
  WHERE revoked_at IS NULL;
ALTER TABLE moderation.account_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON moderation.account_actions FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA moderation TO service_role;
GRANT ALL ON moderation.account_actions TO service_role;

CREATE TABLE moderation.report_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.content_reports(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE moderation.report_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON moderation.report_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON moderation.report_audit TO service_role;

CREATE OR REPLACE FUNCTION private.is_pair_blocked(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_blocks b
    WHERE (b.blocker_id = user_a AND b.blocked_id = user_b)
       OR (b.blocker_id = user_b AND b.blocked_id = user_a)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_account_restricted(target_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (
      (
        COALESCE(
          (SELECT cfg.age_gate_mode FROM private.safety_policy_config cfg WHERE cfg.singleton),
          'cohort'
        ) = 'all'
        OR EXISTS (
          SELECT 1 FROM private.safety_policy_cohort cohort
          WHERE cohort.user_id = target_user
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.age_attestations age
        WHERE age.user_id = target_user
          AND age.minimum_age = 16
          AND age.policy_version = '2026-07-15'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM moderation.account_actions a
      WHERE a.target_user_id = target_user
        AND a.revoked_at IS NULL
        AND a.action IN ('suspension', 'ban')
        AND (a.action = 'ban' OR a.expires_at > NOW())
    );
$$;

REVOKE ALL ON FUNCTION private.is_pair_blocked(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_account_restricted(UUID) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_pair_blocked(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_account_restricted(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_age_attestation(p_policy_version TEXT)
RETURNS public.age_attestations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  result public.age_attestations;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_policy_version IS NULL OR char_length(trim(p_policy_version)) < 4 THEN
    RAISE EXCEPTION 'Invalid age policy version';
  END IF;

  INSERT INTO public.age_attestations(user_id, minimum_age, policy_version)
  VALUES (actor_id, 16, trim(p_policy_version))
  ON CONFLICT (user_id) DO UPDATE
    SET minimum_age = 16,
        policy_version = EXCLUDED.policy_version,
        attested_at = NOW()
  RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_user(p_blocked_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_blocked_user_id IS NULL OR p_blocked_user_id = actor_id THEN
    RAISE EXCEPTION 'Invalid blocked user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_blocked_user_id) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.user_blocks(blocker_id, blocked_id)
  VALUES (actor_id, p_blocked_user_id)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.friendships f
  WHERE (f.user_id = actor_id AND f.friend_id = p_blocked_user_id)
     OR (f.user_id = p_blocked_user_id AND f.friend_id = actor_id);

  DELETE FROM public.nix_capture_prefs p
  WHERE (p.owner_user_id = actor_id AND p.friend_user_id = p_blocked_user_id)
     OR (p.owner_user_id = p_blocked_user_id AND p.friend_user_id = actor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_blocked_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  DELETE FROM public.user_blocks
  WHERE blocker_id = auth.uid() AND blocked_id = p_blocked_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_blocked_users()
RETURNS TABLE(blocked_user_id UUID, username TEXT, avatar_storage_path TEXT, avatar_emoji TEXT, blocked_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji, b.created_at
  FROM public.user_blocks b
  JOIN public.profiles p ON p.id = b.blocked_id
  WHERE b.blocker_id = auth.uid()
  ORDER BY b.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_my_content_reports()
RETURNS TABLE(
  id UUID,
  reported_user_id UUID,
  reported_username TEXT,
  reason TEXT,
  status TEXT,
  priority TEXT,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.reported_user_id, p.username, r.reason, r.status, r.priority, r.created_at, r.resolved_at
  FROM public.content_reports r
  LEFT JOIN public.profiles p ON p.id = r.reported_user_id
  WHERE r.reporter_id = auth.uid()
  ORDER BY r.created_at DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.create_content_report(
  p_reason TEXT,
  p_nix_id UUID DEFAULT NULL,
  p_reported_user_id UUID DEFAULT NULL,
  p_details TEXT DEFAULT NULL
)
RETURNS TABLE(
  report_id UUID,
  media_path TEXT,
  media_type TEXT,
  reported_user_id UUID,
  evidence_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  target_user UUID;
  target_media_path TEXT;
  target_media_type TEXT;
  existing_report UUID;
  new_report_id UUID;
  report_priority TEXT;
  expiry TIMESTAMPTZ := NOW() + INTERVAL '30 days';
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_reason NOT IN ('sexual_content', 'violence', 'self_harm', 'harassment', 'hate', 'impersonation', 'spam', 'privacy', 'illegal_content', 'other') THEN
    RAISE EXCEPTION 'Invalid report reason';
  END IF;
  IF p_details IS NOT NULL AND char_length(p_details) > 500 THEN
    RAISE EXCEPTION 'Report details are too long';
  END IF;
  IF p_nix_id IS NULL AND p_reported_user_id IS NULL THEN
    RAISE EXCEPTION 'A message or user is required';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.content_reports r
    WHERE r.reporter_id = actor_id
      AND r.created_at > NOW() - INTERVAL '24 hours'
  ) >= 20 THEN
    RAISE EXCEPTION 'Report rate limit exceeded';
  END IF;

  IF p_nix_id IS NOT NULL THEN
    SELECT n.sender_id, n.media_path, n.media_type
      INTO target_user, target_media_path, target_media_type
    FROM public.nixes n
    WHERE n.id = p_nix_id AND n.receiver_id = actor_id;

    IF target_user IS NULL THEN
      RAISE EXCEPTION 'Message is not reportable';
    END IF;

    SELECT r.id INTO existing_report
    FROM public.content_reports r
    WHERE r.reporter_id = actor_id AND r.nix_id = p_nix_id
    LIMIT 1;

    IF existing_report IS NOT NULL THEN
      RETURN QUERY
      SELECT r.id, target_media_path, target_media_type, r.reported_user_id, r.evidence_expires_at
      FROM public.content_reports r
      WHERE r.id = existing_report;
      RETURN;
    END IF;
  ELSE
    target_user := p_reported_user_id;
    IF target_user = actor_id OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = target_user) THEN
      RAISE EXCEPTION 'User is not reportable';
    END IF;
  END IF;

  report_priority := CASE
    WHEN p_reason IN ('violence', 'self_harm', 'illegal_content') THEN 'critical'
    ELSE 'normal'
  END;

  INSERT INTO public.content_reports(
    reporter_id, reported_user_id, nix_id, reason, details, priority, evidence_expires_at
  ) VALUES (
    actor_id, target_user, p_nix_id, p_reason, NULLIF(trim(p_details), ''), report_priority,
    CASE WHEN p_nix_id IS NULL THEN NULL ELSE expiry END
  )
  RETURNING id INTO new_report_id;

  INSERT INTO moderation.report_audit(report_id, action, note)
  VALUES (new_report_id, 'created', NULL);

  RETURN QUERY SELECT new_report_id, target_media_path, target_media_type, target_user,
    CASE WHEN p_nix_id IS NULL THEN NULL::TIMESTAMPTZ ELSE expiry END;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderation_decide_report(
  p_report_id UUID,
  p_decision TEXT,
  p_note TEXT DEFAULT NULL,
  p_suspension_hours INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user UUID;
  current_status TEXT;
  action_expiry TIMESTAMPTZ;
BEGIN
  IF p_decision NOT IN ('dismiss', 'warning', 'suspension', 'ban') THEN
    RAISE EXCEPTION 'Invalid moderation decision';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'Moderation note is too long';
  END IF;
  IF p_decision = 'suspension'
    AND (p_suspension_hours IS NULL OR p_suspension_hours < 1 OR p_suspension_hours > 8760) THEN
    RAISE EXCEPTION 'Suspension must be between 1 and 8760 hours';
  END IF;

  SELECT r.reported_user_id, r.status
    INTO target_user, current_status
  FROM public.content_reports r
  WHERE r.id = p_report_id
  FOR UPDATE;

  IF current_status IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF current_status NOT IN ('open', 'in_review', 'escalated', 'evidence_failed') THEN
    RAISE EXCEPTION 'Report is already resolved';
  END IF;

  IF p_decision <> 'dismiss' THEN
    IF target_user IS NULL THEN RAISE EXCEPTION 'Reported user no longer exists'; END IF;
    action_expiry := CASE
      WHEN p_decision = 'suspension' THEN NOW() + make_interval(hours => p_suspension_hours)
      ELSE NULL
    END;
    INSERT INTO moderation.account_actions(report_id, target_user_id, action, reason, expires_at)
    VALUES (
      p_report_id,
      target_user,
      p_decision,
      COALESCE(NULLIF(trim(p_note), ''), 'Moderation decision for report ' || p_report_id::TEXT),
      action_expiry
    );
  END IF;

  UPDATE public.content_reports
  SET status = CASE WHEN p_decision = 'dismiss' THEN 'dismissed' ELSE 'actioned' END,
      acknowledged_at = COALESCE(acknowledged_at, NOW()),
      resolved_at = NOW()
  WHERE id = p_report_id;

  INSERT INTO moderation.report_audit(report_id, action, note)
  VALUES (p_report_id, p_decision, NULLIF(trim(p_note), ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.moderation_record_appeal(
  p_report_id UUID,
  p_outcome TEXT,
  p_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_outcome NOT IN ('upheld', 'action_revoked') THEN
    RAISE EXCEPTION 'Invalid appeal outcome';
  END IF;
  IF p_note IS NULL OR char_length(trim(p_note)) < 3 OR char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'Appeal note must be between 3 and 1000 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.content_reports r
    WHERE r.id = p_report_id AND r.status IN ('actioned', 'dismissed')
  ) THEN
    RAISE EXCEPTION 'Resolved report not found';
  END IF;

  IF p_outcome = 'action_revoked' THEN
    UPDATE moderation.account_actions
    SET revoked_at = NOW()
    WHERE report_id = p_report_id AND revoked_at IS NULL;
  END IF;

  INSERT INTO moderation.report_audit(report_id, action, note)
  VALUES (p_report_id, 'appeal_' || p_outcome, trim(p_note));
END;
$$;

CREATE OR REPLACE FUNCTION public.can_send_nix(sender UUID, receiver UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  friendship_exists BOOLEAN;
  recent_count INT;
BEGIN
  IF auth.uid() IS NULL OR sender IS DISTINCT FROM auth.uid() THEN RETURN FALSE; END IF;
  IF sender IS NULL OR receiver IS NULL OR sender = receiver THEN RETURN FALSE; END IF;
  IF private.is_pair_blocked(sender, receiver) THEN RETURN FALSE; END IF;
  IF private.is_account_restricted(sender) OR private.is_account_restricted(receiver) THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.user_id = sender AND f.friend_id = receiver) OR (f.user_id = receiver AND f.friend_id = sender))
  ) INTO friendship_exists;
  IF NOT friendship_exists THEN RETURN FALSE; END IF;

  SELECT COUNT(*) INTO recent_count
  FROM public.nixes n
  WHERE n.sender_id = sender AND n.created_at > NOW() - INTERVAL '1 minute';
  RETURN recent_count < 20;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(search_username TEXT)
RETURNS TABLE(id UUID, username TEXT, avatar_storage_path TEXT, avatar_emoji TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND NOT private.is_account_restricted(auth.uid())
    AND lower(p.username) = lower(search_username)
    AND p.id <> auth.uid()
    AND NOT private.is_pair_blocked(auth.uid(), p.id)
    AND NOT private.is_account_restricted(p.id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profiles_by_ids(profile_ids UUID[])
RETURNS TABLE(id UUID, username TEXT, avatar_storage_path TEXT, avatar_emoji TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p
  WHERE p.id = ANY(profile_ids)
    AND NOT private.is_account_restricted(auth.uid())
    AND p.username IS NOT NULL
    AND NOT private.is_pair_blocked(auth.uid(), p.id)
    AND NOT private.is_account_restricted(p.id)
  ORDER BY p.username ASC;
$$;

CREATE OR REPLACE FUNCTION public.list_accepted_friends_paginated(
  page_limit INT DEFAULT 50,
  before_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(id UUID, username TEXT, avatar_storage_path TEXT, avatar_emoji TEXT, friendship_created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH relations AS (
    SELECT CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END AS friend_profile_id,
           f.created_at
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.user_id = auth.uid() OR f.friend_id = auth.uid())
      AND (before_created_at IS NULL OR f.created_at < before_created_at)
    ORDER BY f.created_at DESC
    LIMIT LEAST(GREATEST(page_limit, 1), 100)
  )
  SELECT p.id, p.username, p.avatar_storage_path, p.avatar_emoji, r.created_at
  FROM relations r
  JOIN public.profiles p ON p.id = r.friend_profile_id
  WHERE NOT private.is_account_restricted(auth.uid())
    AND p.username IS NOT NULL
    AND NOT private.is_pair_blocked(auth.uid(), p.id)
    AND NOT private.is_account_restricted(p.id)
  ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.fetch_inbox_nixes_paginated(
  page_limit INT DEFAULT 50,
  before_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.nixes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT n.* FROM public.nixes n
  WHERE n.receiver_id = auth.uid()
    AND NOT private.is_account_restricted(n.receiver_id)
    AND NOT private.is_pair_blocked(n.sender_id, n.receiver_id)
    AND NOT private.is_account_restricted(n.sender_id)
    AND (before_created_at IS NULL OR n.created_at < before_created_at)
  ORDER BY n.created_at DESC
  LIMIT LEAST(GREATEST(page_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.fetch_sent_nixes_paginated(
  page_limit INT DEFAULT 50,
  before_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.nixes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT n.* FROM public.nixes n
  WHERE n.sender_id = auth.uid()
    AND NOT private.is_pair_blocked(n.sender_id, n.receiver_id)
    AND NOT private.is_account_restricted(n.sender_id)
    AND NOT private.is_account_restricted(n.receiver_id)
    AND (before_created_at IS NULL OR n.created_at < before_created_at)
  ORDER BY n.created_at DESC
  LIMIT LEAST(GREATEST(page_limit, 1), 100);
$$;

-- QR invites must not reveal or reconnect blocked/restricted accounts. The
-- redeemed token is locked before validation so concurrent redemption remains
-- single-use without consuming a token that safety policy rejects.
CREATE OR REPLACE FUNCTION public.create_friend_invite(invite_channel TEXT)
RETURNS TABLE(invite_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  token_plain TEXT;
  token_digest TEXT;
  expiration TIMESTAMPTZ;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF private.is_account_restricted((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Account is restricted';
  END IF;
  IF lower(trim(invite_channel)) <> 'qr' THEN
    RAISE EXCEPTION 'Invalid invite channel';
  END IF;

  token_plain := replace(extensions.gen_random_uuid()::TEXT, '-', '')
    || replace(extensions.gen_random_uuid()::TEXT, '-', '');
  token_digest := md5(token_plain);
  expiration := NOW() + INTERVAL '5 minutes';

  INSERT INTO public.friend_invites (created_by, token_hash, channel, expires_at)
  VALUES ((SELECT auth.uid()), token_digest, 'qr', expiration);
  RETURN QUERY SELECT token_plain, expiration;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_friend_invite(invite_token TEXT)
RETURNS TABLE(status TEXT, profile_id UUID, username TEXT, avatar_storage_path TEXT, avatar_emoji TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inviter_id UUID;
  requester_id UUID := (SELECT auth.uid());
  token_digest TEXT;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF invite_token IS NULL OR char_length(invite_token) < 16 THEN
    RETURN QUERY SELECT 'invalid_or_expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  token_digest := md5(invite_token);
  SELECT fi.created_by INTO inviter_id
  FROM public.friend_invites fi
  WHERE fi.token_hash = token_digest AND fi.used_at IS NULL AND fi.expires_at > NOW()
  LIMIT 1;

  IF inviter_id IS NULL
    OR private.is_pair_blocked(requester_id, inviter_id)
    OR private.is_account_restricted(requester_id)
    OR private.is_account_restricted(inviter_id) THEN
    RETURN QUERY SELECT 'invalid_or_expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  IF inviter_id = requester_id THEN
    RETURN QUERY SELECT 'own_invite'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.friend_invites fi
  SET previewed_by = requester_id, previewed_at = NOW()
  WHERE fi.token_hash = token_digest AND fi.used_at IS NULL AND fi.expires_at > NOW();

  RETURN QUERY
  SELECT 'ok'::TEXT, p.id, p.username, p.avatar_storage_path, p.avatar_emoji
  FROM public.profiles p WHERE p.id = inviter_id AND p.username IS NOT NULL LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_friend_invite(invite_token TEXT)
RETURNS TABLE(result TEXT, friend_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inviter_id UUID;
  actor_id UUID := (SELECT auth.uid());
  token_digest TEXT;
  pending_row_id UUID;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF invite_token IS NULL OR char_length(invite_token) < 16 THEN RAISE EXCEPTION 'Invalid invite token'; END IF;

  token_digest := md5(invite_token);
  SELECT fi.created_by INTO inviter_id
  FROM public.friend_invites fi
  WHERE fi.token_hash = token_digest AND fi.used_at IS NULL AND fi.expires_at > NOW()
  FOR UPDATE;

  IF inviter_id IS NULL THEN RAISE EXCEPTION 'Invite token expired, invalid, or already used'; END IF;
  IF inviter_id = actor_id THEN RAISE EXCEPTION 'Cannot redeem your own invite'; END IF;
  IF private.is_pair_blocked(actor_id, inviter_id)
    OR private.is_account_restricted(actor_id)
    OR private.is_account_restricted(inviter_id) THEN
    RAISE EXCEPTION 'Invite token is unavailable';
  END IF;

  UPDATE public.friend_invites fi
  SET used_at = NOW(), used_by = actor_id
  WHERE fi.token_hash = token_digest AND fi.used_at IS NULL;

  IF EXISTS (
    SELECT 1 FROM public.friendships f WHERE f.status = 'accepted'
      AND ((f.user_id = actor_id AND f.friend_id = inviter_id)
        OR (f.user_id = inviter_id AND f.friend_id = actor_id))
  ) THEN
    RETURN QUERY SELECT 'already_friends'::TEXT, inviter_id; RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.friendships f WHERE f.status = 'pending'
      AND f.user_id = actor_id AND f.friend_id = inviter_id
  ) THEN
    RETURN QUERY SELECT 'already_requested'::TEXT, inviter_id; RETURN;
  END IF;

  SELECT f.id INTO pending_row_id FROM public.friendships f
  WHERE f.status = 'pending' AND f.user_id = inviter_id AND f.friend_id = actor_id LIMIT 1;
  IF pending_row_id IS NOT NULL THEN
    UPDATE public.friendships f SET status = 'accepted' WHERE f.id = pending_row_id;
    RETURN QUERY SELECT 'accepted_reverse_request'::TEXT, inviter_id; RETURN;
  END IF;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (actor_id, inviter_id, 'pending');
  RETURN QUERY SELECT 'request_sent'::TEXT, inviter_id;
END;
$$;

-- Direct username invites still use the friendships table, so enforce blocks
-- at RLS as well as in RPCs.
DROP POLICY IF EXISTS nixes_select ON public.nixes;
DROP POLICY IF EXISTS "nixes_select" ON public.nixes;
CREATE POLICY nixes_select
  ON public.nixes FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.uid()) = sender_id OR (SELECT auth.uid()) = receiver_id)
    AND NOT private.is_pair_blocked(sender_id, receiver_id)
    AND NOT private.is_account_restricted((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS nixes_update_viewed ON public.nixes;
DROP POLICY IF EXISTS "nixes_update_viewed" ON public.nixes;
CREATE POLICY nixes_update_viewed
  ON public.nixes FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = receiver_id
    AND NOT private.is_pair_blocked(sender_id, receiver_id)
    AND NOT private.is_account_restricted((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) = receiver_id
    AND NOT private.is_pair_blocked(sender_id, receiver_id)
    AND NOT private.is_account_restricted((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS friendships_insert ON public.friendships;
DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
CREATE POLICY friendships_insert
  ON public.friendships FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND user_id <> friend_id
    AND NOT private.is_pair_blocked(user_id, friend_id)
    AND NOT private.is_account_restricted(user_id)
    AND NOT private.is_account_restricted(friend_id)
  );

DROP POLICY IF EXISTS friendships_update ON public.friendships;
DROP POLICY IF EXISTS "friendships_update" ON public.friendships;
CREATE POLICY friendships_update
  ON public.friendships FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = friend_id
    AND NOT private.is_pair_blocked(user_id, friend_id)
    AND NOT private.is_account_restricted(user_id)
    AND NOT private.is_account_restricted(friend_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = friend_id
    AND NOT private.is_pair_blocked(user_id, friend_id)
    AND NOT private.is_account_restricted(user_id)
    AND NOT private.is_account_restricted(friend_id)
  );

DROP POLICY IF EXISTS upload_logs_select ON public.upload_logs;
DROP POLICY IF EXISTS "upload_logs_select" ON public.upload_logs;
CREATE POLICY upload_logs_select
  ON public.upload_logs FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.uid()) = sender_id OR (SELECT auth.uid()) = receiver_id)
    AND NOT private.is_pair_blocked(sender_id, receiver_id)
  );

DROP POLICY IF EXISTS storage_select ON storage.objects;
DROP POLICY IF EXISTS "storage_select" ON storage.objects;
CREATE POLICY storage_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'media-vault'
    AND EXISTS (
      SELECT 1 FROM public.nixes n
      WHERE n.media_path = name
        AND (n.sender_id = (SELECT auth.uid()) OR n.receiver_id = (SELECT auth.uid()))
        AND NOT private.is_pair_blocked(n.sender_id, n.receiver_id)
    )
  );

DROP POLICY IF EXISTS avatars_storage_select ON storage.objects;
DROP POLICY IF EXISTS "avatars_storage_select" ON storage.objects;
CREATE POLICY avatars_storage_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND NOT private.is_pair_blocked((SELECT auth.uid()), split_part(name, '/', 1)::UUID)
    AND (
      split_part(name, '/', 1)::UUID = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND ((f.user_id = (SELECT auth.uid()) AND f.friend_id = split_part(name, '/', 1)::UUID)
            OR (f.friend_id = (SELECT auth.uid()) AND f.user_id = split_part(name, '/', 1)::UUID))
      )
      OR EXISTS (
        SELECT 1 FROM public.nixes n
        WHERE (n.sender_id = (SELECT auth.uid()) AND n.receiver_id = split_part(name, '/', 1)::UUID)
           OR (n.receiver_id = (SELECT auth.uid()) AND n.sender_id = split_part(name, '/', 1)::UUID)
      )
      OR EXISTS (
        SELECT 1 FROM public.friend_invites fi
        WHERE fi.created_by = split_part(name, '/', 1)::UUID
          AND fi.previewed_by = (SELECT auth.uid())
          AND fi.used_at IS NULL AND fi.expires_at > NOW()
      )
    )
  );

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moderation-evidence',
  'moderation-evidence',
  FALSE,
  419430400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/x-m4v']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No client policies are created for moderation-evidence. Only service_role can
-- access it, and service_role bypasses RLS.

REVOKE ALL ON FUNCTION public.record_age_attestation(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.block_user(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unblock_user(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_blocked_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_content_reports() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_content_report(TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moderation_decide_report(UUID, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_record_appeal(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_age_attestation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_blocked_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_content_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_content_report(TEXT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_decide_report(UUID, TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.moderation_record_appeal(UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.create_friend_invite(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_friend_invite(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_friend_invite(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_friend_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_friend_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_friend_invite(TEXT) TO authenticated;

COMMIT;
