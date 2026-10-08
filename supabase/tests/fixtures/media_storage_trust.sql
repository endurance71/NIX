-- Real Auth/Storage integration fixture. psql variables sender_id/receiver_id
-- must be UUIDs from this disposable stack's Auth signup response.
-- Upload exactly 13 ASCII bytes (safe-original), then replace while pending
-- with safe-replaced (also 13 bytes), both Content-Type image/jpeg.
INSERT INTO public.friendships(user_id,friend_id,status)
VALUES (:'sender_id'::uuid,:'receiver_id'::uuid,'accepted') ON CONFLICT DO NOTHING;
INSERT INTO public.media_assets(id,owner_id,storage_path,media_type,content_type,size_bytes)
VALUES('f7000000-0000-4000-8000-000000000001',:'sender_id'::uuid,
  'nixes/' || :'sender_id' || '/storage-trust.jpg','image','image/jpeg',13);
INSERT INTO public.media_upload_batches(id,sender_id,asset_id,idempotency_key,finalize_token_hash)
VALUES('f8000000-0000-4000-8000-000000000001',:'sender_id'::uuid,
  'f7000000-0000-4000-8000-000000000001','storage-trust-http',repeat('c',64));
UPDATE public.media_assets SET upload_batch_id='f8000000-0000-4000-8000-000000000001'
WHERE id='f7000000-0000-4000-8000-000000000001';
INSERT INTO public.media_upload_recipients(batch_id,receiver_id)
VALUES('f8000000-0000-4000-8000-000000000001',:'receiver_id'::uuid);
SELECT json_build_object('asset_id','f7000000-0000-4000-8000-000000000001',
  'batch_id','f8000000-0000-4000-8000-000000000001',
  'storage_path','nixes/' || :'sender_id' || '/storage-trust.jpg');
