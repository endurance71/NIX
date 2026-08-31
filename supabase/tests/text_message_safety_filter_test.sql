BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(20);

SELECT ok(
  private.text_message_passes_safety_filter('Cześć, wracam koło osiemnastej.'),
  'ordinary PL conversation allowed'
);

SELECT ok(
  private.text_message_passes_safety_filter('See you at the office tomorrow morning.'),
  'ordinary EN conversation allowed'
);

SELECT ok(
  private.text_message_passes_safety_filter('Kill the lights before you leave.'),
  'kill without threat phrase allowed'
);

SELECT ok(
  private.text_message_passes_safety_filter('I will kill time at the station.'),
  'kill time allowed'
);

SELECT ok(
  private.text_message_passes_safety_filter('Need spice and a children bicycle.'),
  'spice and children without CSAM allowed'
);

SELECT ok(
  private.text_message_passes_safety_filter('Czy zabijecie komara?'),
  '2nd-person plural kill-the-mosquito allowed'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('I will kill you'),
  'direct EN threat blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('zabiję cię'),
  'direct PL threat blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('Zabiję cię'),
  'capitalized PL threat blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('kill yourself'),
  'self-harm phrase blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('zabij się'),
  'PL self-harm phrase blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('k i l l   y o u r s e l f'),
  'spaced self-harm obfuscation blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter(U&'kill\200Byourself'),
  'zero-width self-harm obfuscation blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('zabiję' || chr(8203) || 'cię'),
  'zero-width PL threat still blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('k1ll y0urself'),
  'documented leetspeak self-harm blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('how to suicide'),
  'suicide instruction blocked'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('child porn'),
  'CSAM phrase blocked'
);

SELECT ok(
  private.text_message_passes_safety_filter('Cześć' || chr(8203) || ', wracam koło osiemnastej.'),
  'zero-width in ordinary PL still allowed'
);

SELECT ok(
  NOT private.text_message_passes_safety_filter('javascript:alert(1)'),
  'javascript URL blocked'
);

SELECT ok(
  private.text_message_safety_folded('zabiję cię') = 'zabijecie'
  AND position('zabijecie' in private.text_message_safety_folded('Czy zabijecie komara?')) > 0
  AND private.text_message_passes_safety_filter('Czy zabijecie komara?')
  AND NOT private.text_message_passes_safety_filter('zabiję cię'),
  'folded zabijecie collision does not block mosquito question'
);

SELECT * FROM finish();
ROLLBACK;
