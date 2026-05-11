# Przepływ pracy deweloperskiej

## Standard pracy

1. Twórz małe, tematyczne zmiany (stabilizacja → refaktor → docs).
2. Przed PR uruchom:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run knip` (opcjonalnie: nieużywane pliki zależne od entry — patrz [`knip.json`](../knip.json))
   - `npm run react-doctor:diff` lub `npm run react-doctor:score` (regresje jakości React/RN — patrz [`docs/react-doctor-baseline.md`](./react-doctor-baseline.md))
3. Opisz w PR:
   - zakres zmian,
   - ryzyka,
   - krótki plan testów manualnych (jeśli dotyczy).

## Lista testów dymnych (manualnie)

### Uwierzytelnianie (e-mail + hasło)

- [ ] Rejestracja: poprawny e-mail i hasło → ekran „sprawdź e-mail” / komunikat zgodny z konfiguracją Supabase.
- [ ] Po potwierdzeniu e-maila: logowanie prowadzi do onboardingu (nowy user) lub kart (istniejący).
- [ ] Logowanie: błędne hasło → komunikat `invalidCredentials`; niepotwierdzony e-mail → `emailNotConfirmed`.
- [ ] Reset hasła: link z e-maila otwiera aplikację (`nix://`) i ekran nowego hasła.
- [ ] Zmiana hasła z profilu (zalogowany).

### Znajomi (wyszukiwanie i zaproszenia)

- [ ] Wyszukanie istniejącego użytkownika po `@nazwa_uzytkownika`.
- [ ] Wysłanie zaproszenia i brak duplikatu po ponownej próbie (oczekiwane zachowanie API).
- [ ] Akceptacja zaproszenia odwrotnego po kliknięciu „Wyślij” dla tego samego użytkownika.
- [ ] Akceptacja i odrzucenie zaproszenia z ekranu profilu.
- [ ] Lista znajomych zawiera zaakceptowane relacje po odświeżeniu.
- [ ] Ekran `send-to` pokazuje tylko zaakceptowanych znajomych.

### Znajomi (QR)

- [ ] Wygenerowanie zaproszenia QR (`friend-my-code`) — token z krótkim TTL (5 min w SQL).
- [ ] Skan / deep link drugim kontem → `friend-invite` / confirm — relacja `pending` lub auto-akceptacja przy odwrotnym pending.
- [ ] Telemetria `friend_qr_scan` / `friend_invite_redeem` widoczna w dev (console) lub Sentry breadcrumbs.

### Przepływ wiadomości

- [ ] Kamera: zdjęcie (tap) i przejście do preview.
- [ ] Kamera: wideo (przytrzymanie) do limitu czasu — preview i wysyłka.
- [ ] Wyślij-do: lista odbiorców bez mocków; przy braku profili widoczny pusty stan.
- [ ] Przesyłanie: wysłanie wiadomości tworzy rekord w `nixes` (status `sent`).
- [ ] Skrzynka: nowa wiadomość widoczna u odbiorcy.
- [ ] Podgląd / viewer: po obejrzeniu wiadomość jest oznaczona jako `is_viewed`; wywołanie `cleanup-nix`; rekord przechodzi w stan końcowy (`cleaned` przy aktualnym schemacie).
- [ ] Po wejściu na skrzynkę: `flushCleanupQueue` nie rzuca błędów przy braku zadań.

### Ochrona capture (viewer)

- [ ] Domyślnie: przy próbie screenshotu w viewerze — blokada / toast (iOS, urządzenie fizyczne zalecane).
- [ ] W profilu: „zezwalaj od @X” → viewer bez blokady; ponowne wyłączenie przywraca blokadę.
- [ ] Checklista: `docs/capture_protection_ios_checklist.md`.

### i18n (PL + EN)

- [ ] Urządzenie / symulator z językiem PL: kluczowe stringi z `src/lib/i18n.ts`.
- [ ] Przełączenie na EN: ten sam flow (auth, inbox, profil, send/viewer) bez hardcoded copy.

### Sesja

- [ ] Wylogowanie z profilu kończy sesję i wraca do loginu.
- [ ] Ponowne uruchomienie app respektuje zapisany stan sesji.

## Observability i alerty

Monitoruj cyklicznie:

- `nix_cleanup_queue`:
  - liczba rekordów oczekujących (`next_attempt_at <= now`) > 20 przez 10 min → alert.
- `nix_cleanup_audit`:
  - udział statusu `failed` > 5% w oknie 15 min → alert.
- Upload:
  - skoki błędów `INVALID_MEDIA` lub `RATE_LIMITED` > 2× baseline → alert.
- `upload_logs` (opcjonalnie widoki z `docs/upload-observability-dashboard.sql`):
  - wzrost `failed` / `retrying`, długie `upload_duration_ms` p95.

## Runbook: degradacja cleanupu

1. Sprawdź ostatnie wpisy w `nix_cleanup_audit` i kody błędów.
2. Zweryfikuj dostępność Edge Function `cleanup-nix` i sekrety środowiskowe.
3. Jeśli funkcja działa, uruchom ręczny retry kolejki cleanup dla rekordów zaległych (klient robi `flushCleanupQueue`; ewentualnie operacja SQL według polityki).
4. Gdy problem dotyczy Storage/RLS, cofaj ostatnią zmianę polityk i monitoruj trend kolejki.
5. Po stabilizacji potwierdź, że kolejka wróciła do normalnego poziomu.
