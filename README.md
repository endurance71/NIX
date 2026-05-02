# NiX

NiX to aplikacja Expo tworzona najpierw pod iOS z efemerycznym przepływem wiadomości wizualnych oparta o Supabase.

## Wymagania

- Node.js 20+
- npm 10+
- Xcode + iOS Simulator (dla `expo run:ios`)

## Szybki start

1. Zainstaluj zależności:
   - `npm install`
2. Ustaw zmienne środowiskowe w `.env`:
   - `EXPO_PUBLIC_SUPABASE_URL=...`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`
3. Uruchom aplikację:
   - `npm run start`
4. (Opcjonalnie) build lokalny iOS:
   - `npm run ios`

## Skrypty

- `npm run start` — uruchamia Expo
- `npm run ios` — uruchamia natywny build iOS
- `npm run lint` — lint projektu
- `npm run test` — testy jednostkowe (Vitest)

## Dokumentacja

- Główna dokumentacja produktowo-techniczna: `docs/ZenSnap_Documentation_v1.0.md`
- Konfiguracja bazy Supabase: `docs/supabase_setup.sql`
- Przepływ pracy deweloperskiej i testy dymne: `docs/development-workflow.md`
- Wytyczne motywu systemowego iOS: `docs/theme-guidelines.md`

## System Theme (iOS)

- Aplikacja używa systemowego motywu iOS (`userInterfaceStyle: automatic`).
- Kolory są zarządzane centralnie przez tokeny:
  - `src/theme/colors.ts`
  - `src/theme/theme-context.tsx`
  - `src/hooks/useAppTheme.ts`
- W ekranach i layoutach nie używamy hardcoded kolorów - korzystamy z `useAppTheme()`.

### Jak testować

1. Uruchom `npm run ios`.
2. W iOS Simulator przełącz `Appearance` między Light i Dark.
3. Sprawdź kluczowe flow: logowanie, onboarding, kamera, preview, send-to, inbox, viewer, profil.

## Supabase Edge Function: cleanup-snap

Repo zawiera funkcję `supabase/functions/cleanup-snap/index.ts`, która:
- weryfikuje JWT użytkownika,
- potwierdza, że żądający jest odbiorcą wiadomości,
- usuwa plik ze Storage bucket `media-vault`,
- usuwa rekord z tabeli `snaps`.

Przykładowe wdrożenie:
- `supabase functions deploy cleanup-snap`

Wymagane sekrety funkcji:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Operacje i bezpieczeństwo

- Krytyczne reguły bezpieczeństwa i RLS są utrzymywane w `docs/supabase_setup.sql`.
- Cleanup efemeryczny działa dwuetapowo:
  - oznaczenie jako obejrzane + próba natychmiastowego cleanupu,
  - fallback przez `snap_cleanup_queue` z ponawianiem.
- Zalecany monitoring produkcyjny:
  - liczba rekordów `snap_cleanup_queue` (powinna trendować do zera),
  - odsetek statusów `failed` w `snap_cleanup_audit`,
  - błędy uploadu (`INVALID_MEDIA`, `RATE_LIMITED`, `NOT_FRIEND`).

## Aktualny status techniczny

- Uwierzytelnianie: OTP e-mail przez Supabase (tymczasowo)
- Routing: ochrona sesji i onboarding w `src/app/_layout.tsx`
- Przesyłanie: przepływ zdjęcie -> storage -> rekord `snaps`
- Skrzynka/Podgląd: odczyt i oznaczanie wiadomości jako `is_viewed`
