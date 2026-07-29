-- Keep analytics payloads privacy-safe even when the RPC is called outside
-- the official client. Authenticated users cannot insert into the raw table,
-- so this security-definer function is the only supported write path.

CREATE OR REPLACE FUNCTION public.record_product_analytics_event(
  p_installation_id UUID,
  p_event_name TEXT,
  p_app_version TEXT,
  p_locale TEXT,
  p_properties JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sanitized_properties JSONB := COALESCE(p_properties, '{}'::JSONB);
BEGIN
  IF auth.uid() IS NULL OR p_installation_id IS NULL THEN RETURN FALSE; END IF;
  IF NOT COALESCE((
    SELECT pref.enabled
    FROM public.product_analytics_preferences pref
    WHERE pref.user_id = auth.uid()
  ), FALSE) THEN
    RETURN FALSE;
  END IF;
  IF p_event_name NOT IN (
    'onboarding_completed', 'inbox_search_used', 'invite_shared', 'invite_opened',
    'invite_redeemed', 'first_friend_accepted', 'first_nix_sent', 'nix_opened',
    'text_outbox_retry', 'push_preference_changed', 'data_export_requested'
  ) THEN
    RAISE EXCEPTION 'Unsupported analytics event';
  END IF;
  IF lower(p_locale) NOT IN ('pl', 'en') THEN RAISE EXCEPTION 'Unsupported locale'; END IF;
  IF jsonb_typeof(sanitized_properties) <> 'object'
     OR octet_length(sanitized_properties::TEXT) > 2048
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(sanitized_properties) property
       WHERE property.key NOT IN ('channel', 'enabled', 'has_results', 'outcome', 'source', 'step')
          OR jsonb_typeof(property.value) NOT IN ('null', 'boolean', 'number', 'string')
          OR (
            jsonb_typeof(property.value) = 'string'
            AND octet_length(trim(BOTH '"' FROM property.value::TEXT)) > 80
          )
     ) THEN
    RAISE EXCEPTION 'Unsupported analytics properties';
  END IF;

  INSERT INTO public.product_analytics_events(
    installation_id, event_name, app_version, locale, properties
  )
  VALUES (
    p_installation_id,
    p_event_name,
    left(NULLIF(trim(p_app_version), ''), 40),
    lower(p_locale),
    sanitized_properties
  );
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_product_analytics_event(UUID, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_product_analytics_event(UUID, TEXT, TEXT, TEXT, JSONB)
  TO authenticated;
