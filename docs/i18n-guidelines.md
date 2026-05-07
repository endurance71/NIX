# i18n Guidelines (PL + EN)

## Zakres
- Aplikacja wspiera `pl` i `en`, z fallbackiem do `en`.
- Wszystkie nowe teksty UI, toasty i błędy domenowe muszą być tłumaczone kluczami i18n.

## Architektura
- Źródło prawdy i18n: `src/lib/i18n.ts`.
- Komponenty React używają `useTranslation()` i `t('namespace.key')`.
- Warstwa domenowa opiera się o `DomainError.code` oraz `DomainError.messageKey`.
- Statusy skrzynki i etykiety domenowe muszą pochodzić z tłumaczeń, nie z hardcoded stringów.

## Konwencja kluczy
- Krótkie i stabilne klucze w namespace:
  - `auth.*`, `inbox.*`, `profile.*`, `tabs.*`, `root.*`, `domainErrors.*`, `common.*`.
- Nie używaj dynamicznie składanych nazw kluczy.
- Interpolacje zapisuj jawnie: `t('inbox.invitesSection', { count })`.

## Reguły implementacyjne
- Nie dodawaj hardcoded copy po polsku/angielsku w ekranach i komponentach.
- Dla dat i godzin używaj `Intl` i helperów locale-aware.
- Komunikaty błędów technicznych z backendu mapuj do przyjaznych kluczy tłumaczeń tam, gdzie to możliwe.

## Quality Gate przed PR
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- Manualny smoke test krytycznych flow dla `pl` i `en`:
  - auth, inbox, profile, send/viewer, friend flows.
