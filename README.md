# NiX

NiX to aplikacja Expo (iOS + Android) z efemerycznym przepływem wiadomości wizualnych oparta o Supabase. **Naczelnym wyznacznikiem UI/UX są natywne rozwiązania obu platform** — szczegóły: [`docs/native-platform-guidelines.md`](docs/native-platform-guidelines.md).

## Wymagania

- Node.js 20+
- npm 10+
- Xcode + iOS Simulator (dla `expo run:ios`)
- Android Studio + SDK Platform 35 (dla `expo run:android`)

## Szybki start

1. Zainstaluj zależności:
   - `npm install`
2. Ustaw zmienne środowiskowe w `.env`:
   - `EXPO_PUBLIC_SUPABASE_URL=...`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`
   - (opcjonalnie) `EXPO_PUBLIC_SENTRY_DSN=...` — breadcrumbs telemetrii i crash reporting
3. Uruchom aplikację:
   - `npm run start`
4. (Opcjonalnie) build lokalny:
   - iOS: `npm run ios`
   - Android: `npm run android`

## Skrypty

- `npm run start` — uruchamia Expo
- `npm run ios` — uruchamia natywny build iOS
- `npm run android` — uruchamia natywny build Android
- `npm run lint` — lint projektu
- `npm run test` — testy jednostkowe (Vitest)
- `npm run typecheck` — TypeScript bez emit

## Dokumentacja

- **Wytyczne native-first (iOS + Android):** [`docs/native-platform-guidelines.md`](docs/native-platform-guidelines.md)
- **Design Apple (referencja HIG, nie dev):** [`docs/Design by apple/README.md`](docs/Design%20by%20apple/README.md)
- **Główna dokumentacja produktowo-techniczna:** [`docs/NiX_Documentation_v1.2.md`](docs/NiX_Documentation_v1.2.md)
- **Auth (e-mail + hasło + Apple):** [`docs/auth-flow.md`](docs/auth-flow.md)
- **Apple Sign In — konfiguracja:** [`docs/apple-sign-in-setup.md`](docs/apple-sign-in-setup.md)
- **Szablony e-mail Supabase Auth:** [`docs/supabase-email-templates.md`](docs/supabase-email-templates.md)
- **Zaproszenia QR:** [`docs/friend-invites-qr.md`](docs/friend-invites-qr.md)
- **Pipeline wideo / upload:** [`docs/video-pipeline.md`](docs/video-pipeline.md)
- **Ochrona capture (viewer):** [`docs/capture-protection.md`](docs/capture-protection.md)
- **Checklista manualna iOS (screenshot):** [`docs/capture_protection_ios_checklist.md`](docs/capture_protection_ios_checklist.md)
- **Observability:** [`docs/observability.md`](docs/observability.md)
- **Edge Function cleanup:** [`docs/cleanup-edge-function.md`](docs/cleanup-edge-function.md)
- **Konfiguracja bazy Supabase:** [`docs/supabase_setup.sql`](docs/supabase_setup.sql)
- **Migracja pomocnicza (playback duration):** [`docs/supabase_migration_playback_duration_ms.sql`](docs/supabase_migration_playback_duration_ms.sql)
- **Seed grafu społecznego:** [`docs/supabase_seed_social_graph.sql`](docs/supabase_seed_social_graph.sql)
- **Dashboard SQL uploadów:** [`docs/upload-observability-dashboard.sql`](docs/upload-observability-dashboard.sql)
- **Przepływ pracy i testy dymne:** [`docs/development-workflow.md`](docs/development-workflow.md)
- **Motyw systemowy (iOS + Android):** [`docs/theme-guidelines.md`](docs/theme-guidelines.md)
- **i18n (PL + EN):** [`docs/i18n-guidelines.md`](docs/i18n-guidelines.md)
- **Performance re-audit:** [`docs/performance-reaudit.md`](docs/performance-reaudit.md)

## Social Seed (Supabase)

Skrypt `docs/supabase_seed_social_graph.sql` dopełnia dane społeczne tak, aby każdy użytkownik miał:
- minimum 10 zaakceptowanych znajomych (`friendships.status = 'accepted'`),
- minimum 10 rozmówców (unikalnych peerów) w `nixes`.

Jeżeli w bazie jest mniej niż 11 użytkowników, skrypt doda brakujące konta techniczne (`seed_social_*`) do `auth.users` i `profiles`.

### Kolejność uruchomienia

1. Uruchom `docs/supabase_setup.sql` (schema + RLS + funkcje).
2. Uruchom `docs/supabase_seed_social_graph.sql` (seed danych społecznych).
3. Sprawdź trzy końcowe wyniki SELECT ze skryptu seed:
   - liczba znajomych per user,
   - liczba rozmówców per user,
   - lista odchyleń od celu.

### Oczekiwany wynik

- Trzeci SELECT (odchylenia) powinien zwrócić pusty wynik.
- Skrypt jest idempotentny: można uruchamiać wielokrotnie bez tworzenia duplikatów seedowych par i seedowych nixów.

## System Theme (iOS + Android)

- Aplikacja używa **systemowego** motywu urządzenia (`userInterfaceStyle: automatic`) — light/dark na obu platformach zgodnie z [native-platform-guidelines.md](docs/native-platform-guidelines.md).
- Kolory są zarządzane centralnie przez tokeny:
  - `src/theme/colors.ts`
  - `src/theme/theme-context.tsx`
  - `src/hooks/useAppTheme.ts`
- W ekranach i layoutach nie używamy hardcoded kolorów — korzystamy z `useAppTheme()`.

### Jak testować

1. Uruchom `npm run ios` i/lub `npm run android`.
2. Przełącz motyw systemowy (Light / Dark) na symulatorze lub urządzeniu.
3. Sprawdź kluczowe flow na **obu platformach**: logowanie, onboarding, kamera, preview, send-to, inbox, viewer, profil.

## Supabase Edge Function: cleanup-nix

Repo zawiera funkcję `supabase/functions/cleanup-nix/index.ts`, która:

- weryfikuje JWT użytkownika,
- potwierdza, że żądający jest odbiorcą wiadomości i że `mediaPath` zgadza się z rekordem,
- usuwa plik ze Storage bucket `media-vault`,
- finalizuje rekord nixa (m.in. `status: cleaned` tam, gdzie kolumna istnieje) i zapisuje audit.

Szczegóły: [`docs/cleanup-edge-function.md`](docs/cleanup-edge-function.md).

Przykładowe wdrożenie:

- `supabase functions deploy cleanup-nix`

Wymagane sekrety funkcji:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Operacje i bezpieczeństwo

- Krytyczne reguły bezpieczeństwa i RLS są utrzymywane w `docs/supabase_setup.sql`.
- Cleanup efemeryczny działa dwuetapowo:
  - oznaczenie jako obejrzane + próba natychmiastowego cleanupu,
  - fallback przez `nix_cleanup_queue` z ponawianiem.
- Zalecany monitoring produkcyjny:
  - liczba rekordów `nix_cleanup_queue` (powinna trendować do zera),
  - odsetek statusów `failed` w `nix_cleanup_audit`,
  - błędy uploadu (`INVALID_MEDIA`, `RATE_LIMITED`, `NOT_FRIEND`),
  - metryki w `upload_logs` (np. dashboard z `docs/upload-observability-dashboard.sql`).

## Aktualny status techniczny

- **Uwierzytelnianie:** e-mail + hasło przez Supabase Auth (potwierdzenie e-maila, reset hasła przez deep link `nix://`)
- **i18n:** polski i angielski (`src/lib/i18n.ts` + metadane `app.json` z `src/locales/`)
- **Routing:** ochrona sesji i onboarding w `src/app/_layout.tsx`
- **Przesyłanie:** zdjęcie lub wideo → kompresja → Storage (`media-vault`) → rekord `nixes` (miniatury wideo w `thumbnail_b64`, upload wideo resumable TUS)
- **Skrzynka / viewer:** kolejka FIFO od nadawcy, signed URL, `is_viewed`, cleanup przez Edge Function + kolejka
- **Znajomi:** wyszukiwanie, zaproszenia, **QR** (token jednorazowy), awatary (bucket `avatars`)
- **Capture:** domyślna blokada screenshotów w viewerze; wyjątek per znajomy (`nix_capture_prefs`)
- **Observability:** `src/lib/telemetry.ts`; opcjonalnie Sentry przez `EXPO_PUBLIC_SENTRY_DSN`
