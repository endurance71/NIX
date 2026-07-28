-- Match the existing partial idempotency index so PL/pgSQL can resolve the
-- capture-attempt system message conflict target.
CREATE OR REPLACE FUNCTION public.report_capture_attempt(p_nix_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nix_sender_id UUID;
  v_nix_receiver_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT sender_id, receiver_id
  INTO v_nix_sender_id, v_nix_receiver_id
  FROM public.nixes
  WHERE id = p_nix_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nix not found';
  END IF;
  IF v_nix_receiver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.push_notification_jobs(
    event_type,
    event_key,
    recipient_id,
    actor_id,
    entity_id
  )
  VALUES (
    'capture_attempt',
    'capture_attempt:' || p_nix_id,
    v_nix_sender_id,
    auth.uid(),
    p_nix_id
  )
  ON CONFLICT (event_key) DO NOTHING;

  INSERT INTO public.text_messages(
    sender_id,
    receiver_id,
    body,
    metadata,
    is_system,
    client_message_id
  )
  VALUES (
    auth.uid(),
    v_nix_sender_id,
    'capture_attempt',
    jsonb_build_object('type', 'capture_attempt', 'nix_id', p_nix_id),
    true,
    'sys_capture:' || p_nix_id
  )
  ON CONFLICT (sender_id, receiver_id, client_message_id)
  WHERE client_message_id IS NOT NULL
  DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_capture_attempt(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.report_capture_attempt(UUID) FROM PUBLIC, anon;
