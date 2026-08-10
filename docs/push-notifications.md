# Powiadomienia push — konfiguracja i operacje

NiX używa `expo-notifications`, Expo Push Service oraz dwóch Supabase Edge Functions. Powiadomienia są transakcyjne. Token i przełącznik są przypisane do instalacji urządzenia (`installation_id`).

## Typy zdarzeń

| `event_type` | Kiedy | Odbiorca | Tap |
| --- | --- | --- | --- |
| `new_nix` | nowy NiX | receiver | Inbox |
| `new_text_message` | nowa wiadomość tekstowa | receiver | czat z aktorem |
| `message_reaction` | INSERT / zmiana emoji na wiadomości | autor wiadomości | czat z aktorem |
| `friend_request` | zaproszenie pending | zaproszony | Inbox |
| `friend_accepted` | akceptacja | inicjator | Znajomi |
| `capture_attempt` | próba nagrania ekranu | nadawca nixa | czat z aktorem |

`message_reaction`: `entity_id` = id reakcji; `event_key` = `message_reaction:{reactionId}:{emoji}` (zmiana emoji = nowy job). Badge ikony **nie** rośnie od reakcji (jak friend events) — nadal tylko nieprzeczytane NiXy.

## Rejestracja urządzenia

- `register_push_device` robi **UPSERT po `installation_id`** (migracja `20260810190000_stable_push_device_registration.sql`). Nie kasuje wiersza urządzenia, więc `push_notification_deliveries` (FK `ON DELETE CASCADE`) nie giną przy logout/login ani rotacji tokenu.
- Konflikt tego samego `expo_push_token` na innej instalacji: tamta instalacja jest wyłączana (`token_reassigned`) bez `DELETE`.
- Gdy urządzenie jest już `enabled`, klient woła `touch_push_device` (heartbeat `last_seen_at` / locale / app_version) zamiast pełnego register.
- Pełny register: pierwsze włączenie, rotacja tokenu (`addPushTokenListener`), przejęcie instalacji przez innego usera.
- Opt-in: jednorazowy rationale po onboardingu (`canNavigate`) oraz ponownie po pierwszym udanym sendzie, jeśli użytkownik wcześniej wybrał „Nie teraz”. Przełącznik w Profil → Powiadomienia.

**Uwaga diagnostyczna:** historyczne joby `dispatched` bez wierszy w `push_notification_deliveries` (sprzed UPSERT) to artefakt starego `DELETE` + CASCADE — nie oznaczają odrzucenia przez Expo/APNs. Po deployu UPSERT nowe joby dla recipientów z `enabled` device powinny mieć delivery.

## Wdrożenie

1. Zastosuj migrację `20260715160000_add_push_notifications.sql` oraz `20260810190000_stable_push_device_registration.sql`.
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

- Po onboardingu sprawdź jednorazowy rationale push (także bez wcześniejszego wysłania NiXa).
- Na fizycznym iPhonie włącz push i sprawdź prompt iOS.
- Logout → login: ten sam `push_devices.id` dla `installation_id` (UPSERT, nie nowy wiersz).
- Dla każdego typu zdarzenia sprawdź foreground, background i cold start.
- Sprawdź dwa konta na jednej instalacji oraz jedno konto na dwóch instalacjach.
- Badge ikony aplikacji = liczba nieprzeczytanych NiXów (jak tab Inbox): klient syncuje przez `setBadgeCountAsync`, a `push-dispatch` ustawia `badge` w payloadzie Expo na bieżące unread. Friend request/accept oraz `message_reaction` nie zawyżają badge.
- Reakcje: peer reaguje na Twoją wiadomość → push z glifem; zmiana emoji → drugi push; remove / self-react → brak; wygasła wiadomość → job `skipped`.
- Po wylogowaniu lub wyłączeniu push badge ikony wraca do 0.
- Po 15–20 minutach sprawdź `push_notification_deliveries`; `DeviceNotRegistered` musi dezaktywować urządzenie.

## Monitoring i awaryjne wyłączenie

Monitoruj liczbę zadań `pending/failed`, wiek najstarszego zadania, błędy HTTP Expo i udział `DeviceNotRegistered`. Odpowiedź `push-dispatch` zawiera `processed`, `skippedNoDevice`, `ticketed`. Logi funkcji zawierają wyłącznie identyfikator zadania oraz typ zdarzenia — bez tokenów, nazw i treści.

Awaryjne zatrzymanie wysyłki: wyłącz webhook i zadanie Cron `push-dispatch`. Outbox pozostanie w bazie; przed ponownym uruchomieniem zdecyduj, czy stare zadania oznaczyć jako `skipped`, aby nie wysłać nieaktualnych komunikatów.
