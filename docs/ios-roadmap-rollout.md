# Rollout roadmapy iOS

Wszystkie migracje są addytywne. Klienta wdrażaj dopiero po bazie i Edge Functions.

## Kolejność backendu

1. Zastosuj migracje `20260729120000`–`20260729123000`.
2. Wdróż `push-dispatch`, `data-export-download` i `process-data-exports`.
3. Potwierdź działanie cronów `process-data-exports`,
   `nix-product-analytics-cleanup` i `nix-data-export-cleanup`.
4. Opublikuj zawartość `web/invite` pod `nix.damianmotylinski.pl`:
   - AASA bez redirectu i z `Content-Type: application/json`,
   - `/invite/*` kieruje do landing page,
   - placeholder `__NIX_APP_STORE_URL__` jest zastąpiony finalnym URL,
   - logowanie pełnych ścieżek `/invite/<token>` jest wyłączone.
5. Opublikuj zaktualizowaną politykę prywatności w wersji `2026-07-29`.

Universal Links wymagają nowego binarnego wydania z entitlementem Associated
Domains; nie mogą być uruchomione wyłącznie przez OTA.

## Flagi klienta

Wewnętrzny TestFlight może włączyć wszystkie nowe powierzchnie:

```text
EXPO_PUBLIC_INTERNAL_TESTFLIGHT_ROADMAP_ENABLED=true
```

Każdą powierzchnię można jawnie wyłączyć wartością `false`, także w buildzie
wewnętrznym. Build `1.0.5 (8)` odkłada udostępniane linki zaproszeń na później:

```text
EXPO_PUBLIC_SHARE_INVITES_ENABLED=false
```

QR i dodawanie po username pozostają dostępne. Migracje, RPC, Associated
Domains i kod zaproszeń pozostają addytywnie w projekcie, ale klient nie tworzy,
nie obsługuje ani nie realizuje tokenów `share`.

W produkcji powierzchnie są domyślnie wyłączone i można je włączać niezależnie.
Publiczny kandydat (2026-09-05) trzyma jawnie:

```text
EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=false
EXPO_PUBLIC_SENTRY_ENABLED=false
```

Pozostałe powierzchnie włączać dopiero po gate:

```text
EXPO_PUBLIC_SHARE_INVITES_ENABLED=true
EXPO_PUBLIC_COMMUNICATION_CONTROLS_ENABLED=true
EXPO_PUBLIC_ACCOUNT_DATA_TOOLS_ENABLED=true
```

Przed `EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=true` zamknij audit P1-2 (App Privacy
Product Interaction) i zaktualizuj ASC. Sentry runtime włączaj tylko osobną decyzją
release (nie jednocześnie z publicznym hard-off).

Rollback klienta polega na wyłączeniu odpowiedniej flagi. Nie cofaj migracji
addytywnych.

## Gate wydania

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run deno:check`
- `npm run deno:test`
- `npm run test:supabase-db`
- `npm run check:supabase-migrations`
- `npm run check:supabase-db-lint`
- `npm run check:invite-hosting`
- `npm run check:text-outbox-security`
- `npm run check:ios-config`
- `npm run export:production`
- test dwóch kont na dwóch fizycznych iPhone’ach zgodnie z roadmapą
