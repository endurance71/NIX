-- Strengthen the App Store 1.2 phrase filter already enforced by
-- text_messages_safety_filter_chk. Do not drop the CHECK; replace the
-- function in place. This is not semantic moderation and not a media filter.

CREATE OR REPLACE FUNCTION private.text_message_safety_normalized(body text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $function$
  SELECT btrim(
    regexp_replace(
      lower(
        translate(
          normalize(coalesce(body, ''), NFKC),
          U&'\00AD\180E\200B\200C\200D\200E\200F\202A\202B\202C\202D\202E\2060\2066\2067\2068\2069\FEFF',
          ''
        )
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$function$;

COMMENT ON FUNCTION private.text_message_safety_normalized(text) IS
  'NFKC, strip invisible/bidi marks, lowercase, collapse whitespace. Matching aid only; do not log input.';

CREATE OR REPLACE FUNCTION private.text_message_safety_folded(body text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $function$
  SELECT translate(
    translate(
      regexp_replace(private.text_message_safety_normalized(body), '[^[:alnum:]]', '', 'g'),
      '013457@$!',
      'oieastasi'
    ),
    'ąćęłńóśźż',
    'acelnoszz'
  );
$function$;

COMMENT ON FUNCTION private.text_message_safety_folded(text) IS
  'Compact alnum form plus documented leetspeak 013457@$! and PL diacritic fold. Do not log input.';

CREATE OR REPLACE FUNCTION private.text_message_passes_safety_filter(body text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $function$
DECLARE
  spaced text;
  compact_leet text;
  folded text;
BEGIN
  IF btrim(coalesce(body, '')) = '' THEN
    RETURN false;
  END IF;

  spaced := private.text_message_safety_normalized(body);
  compact_leet := translate(
    regexp_replace(spaced, '[^[:alnum:]]', '', 'g'),
    '013457@$!',
    'oieastasi'
  );
  folded := translate(compact_leet, 'ąćęłńóśźż', 'acelnoszz');

  IF spaced ~* 'javascript[[:space:]]*:'
     OR spaced ~* 'data:text/html'
     OR spaced ~* 'https?://[[:graph:]]*(/exploit(s|kit)?(/|[[:space:]]|$)|/payload\.bin|/shell\.php)'
  THEN
    RETURN false;
  END IF;

  IF spaced ~* '\ycsam\y'
     OR spaced ~* '\ykys\y'
     OR spaced ~* '\ynigger\y'
     OR spaced ~* '\ykike\y'
     OR spaced ~* '\yfaggot\y'
     OR spaced ~* '\yspic\y'
     OR spaced ~* '\ychild[[:space:]]*porn'
     OR spaced ~* '\ypedophil'
     OR spaced ~* 'pornograf[[:alnum:]]*[[:space:]]+dziec'
     OR spaced ~* 'dzieci[eę]c[[:alnum:]]*[[:space:]]+porn'
     OR spaced ~* 'żydożerc'
     OR spaced ~* '\yi[''’]?ll[[:space:]]+kill[[:space:]]+you\y'
     OR spaced ~* '\yi[[:space:]]+will[[:space:]]+kill[[:space:]]+you\y'
     OR spaced ~* '\ykill[[:space:]]+yourself\y'
     OR spaced ~* '\yhow[[:space:]]+to[[:space:]]+suicide\y'
     OR spaced ~* '\ycommit[[:space:]]+suicide\y'
     OR spaced ~* 'zabij[eę][[:space:]]+ci[eę]'
     OR spaced ~* 'zabij[[:space:]]+si[eę]'
     OR spaced ~* '\ybomb[[:space:]]+threat\y'
  THEN
    RETURN false;
  END IF;

  -- Do not match folded 'zabijecie': it collides with 2nd-person plural
  -- "zabijecie" ("will you kill the mosquito?"). PL threats keep ę or a space.
  IF folded ~ 'childporn'
     OR folded ~ 'csam'
     OR folded ~ 'pedophil'
     OR folded ~ 'killyourself'
     OR folded ~ 'illkillyou'
     OR folded ~ 'iwillkillyou'
     OR folded ~ 'howtosuicide'
     OR folded ~ 'commitsuicide'
     OR folded ~ 'zabijsie'
     OR folded ~ 'zydozerc'
     OR folded ~ 'bombthreat'
     OR (folded ~ 'pornograf' AND folded ~ 'dziec')
     OR folded = 'kys'
     OR compact_leet ~ 'zabijęcię'
  THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION private.text_message_passes_safety_filter(text) IS
  'True when a text message body is allowed by the App Store 1.2 phrase filter (NFKC, spacing, documented leetspeak). Not semantic moderation. Never log the body.';
