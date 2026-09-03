-- Contract phase: remove direct client INSERT into text_messages when enforcement is enabled.
-- Apply only after worker + send-text-message are deployed and smoke-tested.

DROP POLICY IF EXISTS text_messages_insert ON public.text_messages;

CREATE POLICY text_messages_insert
  ON public.text_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT private.pre_delivery_moderation_enabled()
    AND sender_id = auth.uid()
    AND public.can_send_text_message(sender_id, receiver_id)
    AND private.text_message_passes_safety_filter(body)
  );
