-- Reconstructs production migration 20260825195500 already recorded in
-- supabase_migrations.schema_migrations. Do not re-run this SQL on the
-- linked remote: add the file only so local and remote history match.
-- Live objects: private.text_message_passes_safety_filter(text) and
-- public.text_messages CHECK text_messages_safety_filter_chk.

CREATE OR REPLACE FUNCTION private.text_message_passes_safety_filter(body text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $function$
  SELECT
    btrim(coalesce(body, '')) <> ''
    AND NOT (
      btrim(body) ~* '\ychild[[:space:]]*porn'
      OR btrim(body) ~* '\ychildporn\y'
      OR btrim(body) ~* '\ycsam\y'
      OR btrim(body) ~* '\ypedophil'
      OR btrim(body) ~* 'pornograf[[:alnum:]]*[[:space:]]+dziec'
      OR btrim(body) ~* 'dzieci[eę]c[[:alnum:]]*[[:space:]]+porn'
      OR btrim(body) ~* '\ynigger\y'
      OR btrim(body) ~* '\ykike\y'
      OR btrim(body) ~* '\yfaggot\y'
      OR btrim(body) ~* '\yspic\y'
      OR btrim(body) ~* 'żydożerc'
      OR btrim(body) ~* '\yi[''’]?ll[[:space:]]+kill[[:space:]]+you\y'
      OR btrim(body) ~* '\ykill[[:space:]]+yourself\y'
      OR btrim(body) ~* '\yi[[:space:]]+will[[:space:]]+kill[[:space:]]+you\y'
      OR btrim(body) ~* 'zabij[eę][[:space:]]+ci[eę]'
      OR btrim(body) ~* '\ybomb[[:space:]]+threat\y'
      OR btrim(body) ~* 'javascript[[:space:]]*:'
      OR btrim(body) ~* 'data:text/html'
      OR btrim(body) ~* 'https?://[[:graph:]]*(/exploit(s|kit)?(/|[[:space:]]|$)|/payload\.bin|/shell\.php)'
    );
$function$;

COMMENT ON FUNCTION private.text_message_passes_safety_filter(text) IS
  'True when a text message body is allowed by the App Store 1.2 phrase filter.';

-- Production grants EXECUTE to PUBLIC (Postgres default) and postgres.
-- CHECK runs as table owner; do not tighten grants here or local reset
-- will diverge from the already-applied remote objects.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'text_messages_safety_filter_chk'
      AND conrelid = 'public.text_messages'::regclass
  ) THEN
    ALTER TABLE public.text_messages
      ADD CONSTRAINT text_messages_safety_filter_chk
      CHECK (private.text_message_passes_safety_filter(body));
  END IF;
END
$$;
