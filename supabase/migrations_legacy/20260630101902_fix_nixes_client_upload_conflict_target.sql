BEGIN;

-- PostgREST upsert with onConflict=(sender_id,receiver_id,client_upload_id)
-- can only infer a non-partial unique index. The previous partial index guarded
-- non-null client_upload_id values, but could not be used as the ON CONFLICT
-- arbiter, causing sends to fail while persisting metadata.
DROP INDEX IF EXISTS public.idx_nixes_sender_receiver_upload_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nixes_sender_receiver_upload_id_unique
  ON public.nixes(sender_id, receiver_id, client_upload_id);

COMMIT;
