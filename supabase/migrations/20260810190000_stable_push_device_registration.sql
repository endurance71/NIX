-- Stable push device registration: UPSERT by installation_id (no DELETE → CASCADE wipe),
-- plus lightweight heartbeat for last_seen without re-register.

CREATE OR REPLACE FUNCTION public.register_push_device(
  p_installation_id UUID,
  p_expo_push_token TEXT,
  p_native_push_token TEXT,
  p_platform TEXT,
  p_locale TEXT,
  p_app_version TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  token TEXT := trim(p_expo_push_token);
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'Invalid platform'; END IF;
  IF p_locale NOT IN ('pl', 'en') THEN RAISE EXCEPTION 'Invalid locale'; END IF;
  IF char_length(token) NOT BETWEEN 20 AND 512 THEN
    RAISE EXCEPTION 'Invalid Expo push token';
  END IF;

  -- Free unique expo_push_token on other installations without deleting rows (preserves deliveries).
  UPDATE public.push_devices
  SET
    expo_push_token = left('revoked:' || id::text || ':' || expo_push_token, 512),
    enabled = FALSE,
    disabled_reason = 'token_reassigned',
    updated_at = now()
  WHERE expo_push_token = token
    AND installation_id IS DISTINCT FROM p_installation_id;

  INSERT INTO public.push_devices (
    installation_id,
    user_id,
    expo_push_token,
    native_push_token,
    platform,
    locale,
    app_version,
    enabled,
    disabled_reason,
    last_seen_at,
    updated_at
  ) VALUES (
    p_installation_id,
    current_user_id,
    token,
    NULLIF(trim(p_native_push_token), ''),
    p_platform,
    p_locale,
    NULLIF(trim(p_app_version), ''),
    TRUE,
    NULL,
    now(),
    now()
  )
  ON CONFLICT (installation_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    expo_push_token = EXCLUDED.expo_push_token,
    native_push_token = EXCLUDED.native_push_token,
    platform = EXCLUDED.platform,
    locale = EXCLUDED.locale,
    app_version = EXCLUDED.app_version,
    enabled = TRUE,
    disabled_reason = NULL,
    last_seen_at = now(),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_push_device(
  p_installation_id UUID,
  p_locale TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE public.push_devices
  SET
    last_seen_at = now(),
    locale = CASE
      WHEN p_locale IN ('pl', 'en') THEN p_locale
      ELSE locale
    END,
    app_version = COALESCE(NULLIF(trim(p_app_version), ''), app_version),
    updated_at = now()
  WHERE installation_id = p_installation_id
    AND user_id = auth.uid()
    AND enabled = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_push_device(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_push_device(UUID, TEXT, TEXT) TO authenticated;
