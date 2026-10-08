-- Only for the isolated fake-provider Storage test, after pending upload/PUT.
-- This exercises real Storage metadata validation and durable SQL delivery.
UPDATE private.safety_policy_config SET pre_delivery_moderation_enabled=true WHERE singleton;
SELECT public.finalize_media_upload_batch('f8000000-0000-4000-8000-000000000001',repeat('c',64));
UPDATE public.moderation_jobs SET status='approved',decision='approved',completed_at=now()
WHERE asset_id='f7000000-0000-4000-8000-000000000001';
SELECT public.materialize_approved_media_batch((SELECT id FROM public.moderation_jobs
  WHERE asset_id='f7000000-0000-4000-8000-000000000001'));
