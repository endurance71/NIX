# i18n Guidelines (PL + EN)

## Zakres

- Aplikacja wspiera `pl` i `en`, z fallbackiem do `en`.
- Wszystkie nowe teksty UI, toasty i błędy domenowe muszą być tłumaczone kluczami i18n.

## Architektura

- **Runtime aplikacji (UI):** źródło prawdy to [`src/lib/i18n.ts`](../src/lib/i18n.ts) — obiekt `resources` zagnieżdżony pod `translation` dla `pl` i `en` (inline w kodzie).
- **Komponenty React:** `useTranslation()` z `react-i18next` i klucze `t('namespace.key')`.
- **Warstwa domenowa:** `DomainError.code` oraz `DomainError.messageKey` tam, gdzie jest używane.
- **Metadane aplikacji (App Store / Expo):** pliki JSON wskazane w `app.json` → `expo.locales`:
  - `src/locales/pl/common.json`
  - `src/locales/en/common.json`  
  Te pliki **nie** zastępują `i18n.ts` dla ekranów — trzymają np. `appName` i inne pola wymagane przez konfigurację Expo.

## Konwencja kluczy

- Krótkie i stabilne klucze w namespace:
  - `common.*`, `root.*`, `tabs.*`, `auth.*`, `inbox.*`, `profile.*`, `notify.*`, `domainErrors.*`, `sentStatus.*`
- Nie używaj dynamicznie składanych nazw kluczy.
- Interpolacje zapisuj jawnie: `t('inbox.invitesSection', { count })`.

## Reguły implementacyjne

- Nie dodawaj hardcoded copy po polsku/angielsku w ekranach i komponentach (wyjątki: logi developerskie, komentarze).
- Dla dat i godzin używaj `Intl` i helperów locale-aware (np. `formatShortTime` z `src/lib/formatters.ts` + `getCurrentLocale()`).
- Komunikaty błędów technicznych z backendu mapuj do przyjaznych kluczy tłumaczeń tam, gdzie to możliwe.

## Quality Gate przed PR

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- Manualny smoke test krytycznych flow dla `pl` i `en`:
  - auth, inbox, profile, send/viewer, friend flows (w tym QR).
