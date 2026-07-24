# Powiadomienia push — konfiguracja i operacje

NiX używa `expo-notifications`, Expo Push Service oraz dwóch Supabase Edge Functions. Powiadomienia są transakcyjne. Token i przełącznik są przypisane do instalacji urządzenia.

## Typy zdarzeń

| `event_type` | Kiedy | Odbiorca | Tap |
| --- | --- | --- | --- |
| `new_nix` | nowy NiX | receiver | Inbox |
| `new_text_message` | nowa wiadomość tekstowa | receiver | czat z aktorem |
| `message_reaction` | INSERT / zmiana emoji na wiadomości (bez DELETE; bez self-react) | autor wiadomości | czat z aktorem |
| `friend_request` | zaproszenie pending | zaproszony | Inbox |
| `friend_accepted` | akceptacja | inicjator | Znajomi |

`message_reaction`: `entity_id` = id reakcji; `event_key` = `message_reaction:{reactionId}:{emoji}` (zmiana emoji = nowy job). Badge ikony **nie** rośnie od reakcji (jak friend events) — nadal tylko nieprzeczytane NiXy.

## Wdrożenie

1. Zastosuj migrację `20260715160000_add_push_notifications.sql`.
2. Utwórz Expo Access Token i włącz **Enhanced Security for Push Notifications**.
3. Ustaw sekret funkcji: `supabase secrets set EXPO_ACCESS_TOKEN=...`.
4. Wdróż funkcje:
   - `supabase functions deploy push-dispatch`
   - `supabase functions deploy push-receipts`
5. Włącz pipeline dispatch (migracja `20260722193000_enable_push_dispatch_pipeline.sql`):
   - trigger `push_jobs_dispatch_webhook` na `INSERT` do `push_notification_jobs` → `private.invoke_push_dispatch()` (`pg_net`, timeout 5 s);
   - Cron `push-dispatch` co minutę, `push-receipts` co 5 minut, `prune-push-notification-history` raz dziennie;
   - w Vault ustaw sekret `push_dispatch_service_role` = service role JWT (Authorization Bearer).
6. Przed pierwszym włączeniem dispatch oznacz zaległe `pending` joby jako `skipped`, żeby nie floodować starymi zdarzeniami.
7. Skonfiguruj Apple Push Notifications key przez `eas credentials`, a następnie wykonaj nowy development build i production/TestFlight build. Push nie należy testować w Expo Go.
8. Production/TestFlight: potwierdź `aps-environment=production` w podpisanych entitlements IPA (w repo `ios/NiX/NiX.entitlements` może zostać `development` dla lokalnych buildów — EAS nadpisuje przy store/TF).
9. Reakcje: zastosuj `20260724160000_add_message_reaction_push.sql` i ponownie wdróż `push-dispatch` (`supabase db push` / apply migracji + `supabase functions deploy push-dispatch`).

Nie zapisuj `EXPO_ACCESS_TOKEN` ani service role key w repozytorium. Funkcje wymagają Bearera service-role (dokładny klucz albo JWT z `role=service_role` po weryfikacji bramy).

## Walidacja

- Na fizycznym iPhonie wyślij pierwszy NiX i sprawdź rationale oraz prompt iOS.
- Sprawdź zgodę, odmowę, ponowne włączenie przez Ustawienia iOS i przełącznik w Profilu.
- Dla każdego typu zdarzenia sprawdź foreground, background i cold start.
- Sprawdź dwa konta na jednej instalacji oraz jedno konto na dwóch instalacjach.
- Badge ikony aplikacji = liczba nieprzeczytanych NiXów (jak tab Inbox): klient syncuje przez `setBadgeCountAsync`, a `push-dispatch` ustawia `badge` w payloadzie Expo na bieżące unread. Friend request/accept oraz `message_reaction` nie zawyżają badge.
- Reakcje: peer reaguje na Twoją wiadomość → push z glifem; zmiana emoji → drugi push; remove / self-react → brak; wygasła wiadomość → job `skipped`.
- Po wylogowaniu lub wyłączeniu push badge ikony wraca do 0.
- Po 15–20 minutach sprawdź `push_notification_deliveries`; `DeviceNotRegistered` musi dezaktywować urządzenie.

## Monitoring i awaryjne wyłączenie

Monitoruj liczbę zadań `pending/failed`, wiek najstarszego zadania, błędy HTTP Expo i udział `DeviceNotRegistered`. Logi funkcji zawierają wyłącznie identyfikator zadania oraz typ zdarzenia — bez tokenów, nazw i treści.

Awaryjne zatrzymanie wysyłki: wyłącz webhook i zadanie Cron `push-dispatch`. Outbox pozostanie w bazie; przed ponownym uruchomieniem zdecyduj, czy stare zadania oznaczyć jako `skipped`, aby nie wysłać nieaktualnych komunikatów.
