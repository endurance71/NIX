# Powiadomienia push — konfiguracja i operacje

NiX używa `expo-notifications`, Expo Push Service oraz dwóch Supabase Edge Functions. Powiadomienia są transakcyjne i obejmują nowy NiX, nowe zaproszenie oraz akceptację zaproszenia. Token i przełącznik są przypisane do instalacji urządzenia.

## Wdrożenie

1. Zastosuj migrację `20260715160000_add_push_notifications.sql`.
2. Utwórz Expo Access Token i włącz **Enhanced Security for Push Notifications**.
3. Ustaw sekret funkcji: `supabase secrets set EXPO_ACCESS_TOKEN=...`.
4. Wdróż funkcje:
   - `supabase functions deploy push-dispatch`
   - `supabase functions deploy push-receipts`
5. W Supabase Database Webhooks utwórz webhook `push-jobs-dispatch`:
   - tabela `push_notification_jobs`, zdarzenie `INSERT`;
   - Edge Function `push-dispatch`, metoda `POST`, timeout co najmniej 5 s;
   - nagłówek Authorization z service role key.
6. W Supabase Cron skonfiguruj wywołania z service-role Authorization:
   - `push-dispatch` co minutę — fallback dla zaległych i retry;
   - `push-receipts` co 5 minut;
   - `select public.prune_push_notification_history()` raz dziennie.
7. Skonfiguruj Apple Push Notifications key przez `eas credentials`, a następnie wykonaj nowy development build i production/TestFlight build. Push nie należy testować w Expo Go.

Nie zapisuj `EXPO_ACCESS_TOKEN` ani service role key w repozytorium. Funkcje odrzucają wywołania bez dokładnego tokenu service role.

## Walidacja

- Na fizycznym iPhonie wyślij pierwszy NiX i sprawdź rationale oraz prompt iOS.
- Sprawdź zgodę, odmowę, ponowne włączenie przez Ustawienia iOS i przełącznik w Profilu.
- Dla każdego typu zdarzenia sprawdź foreground, background i cold start.
- Sprawdź dwa konta na jednej instalacji oraz jedno konto na dwóch instalacjach.
- Po 15–20 minutach sprawdź `push_notification_deliveries`; `DeviceNotRegistered` musi dezaktywować urządzenie.

## Monitoring i awaryjne wyłączenie

Monitoruj liczbę zadań `pending/failed`, wiek najstarszego zadania, błędy HTTP Expo i udział `DeviceNotRegistered`. Logi funkcji zawierają wyłącznie identyfikator zadania oraz typ zdarzenia — bez tokenów, nazw i treści.

Awaryjne zatrzymanie wysyłki: wyłącz webhook i zadanie Cron `push-dispatch`. Outbox pozostanie w bazie; przed ponownym uruchomieniem zdecyduj, czy stare zadania oznaczyć jako `skipped`, aby nie wysłać nieaktualnych komunikatów.
