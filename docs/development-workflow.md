# Przepływ pracy deweloperskiej

> **Wyznacznik platformowy:** Naczelnym kryterium jakości frontendu są **natywne rozwiązania iOS i Android**. Przed merge zmian UI sprawdź [native-platform-guidelines.md](./native-platform-guidelines.md) (hierarchia wyboru, antywzorce, checklista PR).

## Standard pracy

1. Twórz małe, tematyczne zmiany (stabilizacja → refaktor → docs).
2. Przed PR uruchom:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npx expo-doctor@latest` (oczekiwane: 21/21 — patrz sekcja „Bare workflow” poniżej)
   - `npm run knip` (opcjonalnie: nieużywane pliki zależne od entry — patrz [`knip.json`](../knip.json))
   - `npm run react-doctor:diff` lub `npm run react-doctor:score` (regresje jakości React/RN — patrz [`docs/react-doctor-baseline.md`](./react-doctor-baseline.md))
3. Opisz w PR:
   - zakres zmian,
   - ryzyka,
   - krótki plan testów manualnych (jeśli dotyczy),
   - potwierdzenie smoke **iOS + Android** przy zmianach UI (patrz [native-platform-guidelines.md](./native-platform-guidelines.md)).

## Native-first — szybka ściąga

- **UI:** universal `@expo/ui` przed RN primitives; zakaz ogólnych UI-kitów (Paper, NativeBase).
- **Tab bar:** **iOS** `NativeTabs` (ikony bez podpisów); **Android** `expo-router/ui` custom tabs (`FloatingTabBar`, ikony bez podpisów) — nie JS `Tabs`.
- **Ikony:** `AppIcon` / `Icon.select` (SF Symbols + Material Symbols XML).
- **Motyw:** tokeny `useAppTheme()` — bez hardcoded kolorów.
- **Animacje:** Reanimated 4 — bez legacy `Animated` / `LayoutAnimation` na hot path.

## `@expo/ui` — layout formularzy auth

- **Wszystkie ekrany auth** (`login`, `register`, `forgot-password`, `onboarding`): `AuthFormLayout` → `AppHost useViewportSizeMeasurement` + pełny `FieldGroup`.
- **Login:** `LoginScreenSurface` + `AuthBrandHeader`; logika w `useLoginScreen`. Dwa `FieldGroup.Section`: (1) marka + pola, (2) akcje. Przyciski CTA/linki — natywne `@expo/ui` `Button` w **treści sekcji** (nie `SectionFooter`, nie sibling poza `FieldGroup`). Social w `AuthRnBridge`. Bez `flex: 1` na `FieldGroup` — inaczej sibling footer nakłada się na formularz (iOS).
- **RN w FieldGroup:** `AuthRnBridge` tylko gdy universal API nie wystarcza (marka z `expo-image`, social auth, divider). Nagłówki — natywne `Column`/`Text` (`AuthFormHeader`).
- **Pola:** `useNativeState` z `@expo/ui` — przekazywane jako `nativeValue` do `AuthTextField` / `AuthSecureField`; odczyt wartości przy submit przez `.value`.
- **Antywzorzec:** `FieldGroup` wewnątrz RN `ScrollView` lub ze sztywną `height` — na Androidzie powoduje zagnieżdżony scroll pól (`LazyColumn`).

## Bare workflow (`android/` + `ios/` w repo)

Projekt używa bare workflow: foldery natywne są commitowane, a `app.json` nadal opisuje konfigurację prebuild (plugins, uprawnienia, scheme). EAS Build **nie synchronizuje** automatycznie pól z `app.json` do natywnych projektów, gdy `android/` i `ios/` istnieją w repo.

Po każdej zmianie w `app.json` dotyczącej:

- `plugins`
- `ios.infoPlist` / `android.permissions`
- `scheme`
- `locales`
- `icon` / splash

wykonaj:

1. `npx expo prebuild --no-install` lokalnie.
2. Ręcznie zreviewuj diff w `android/` i `ios/` przed commitem.
3. Zweryfikuj pola wysokiego ryzyka: uprawnienia kamery/mikrofonu, URL scheme `nix`, splash, adaptive icon.

Check `appConfigFieldsNotSyncedCheck` jest wyłączony w `package.json` (`expo.doctor`) — to oficjalna opcja dla bare workflow; dyscyplina sync pozostaje obowiązkowa.

## Lista testów dymnych (manualnie)

Testy wykonuj na **iOS i Android** (symulator/emulator lub urządzenie). Krytyczne flow UI muszą być zgodne z natywnymi konwencjami platform — patrz [native-platform-guidelines.md](./native-platform-guidelines.md).

### Safe area (iOS + Android, light/dark)

- [ ] **Inbox / Profil:** treść nie nachodzi na status bar; na iOS large title scrolluje pod transparentnym headerem; na Androidzie opaque header + lista wyrównana do lewej (edge-to-edge).
- [ ] **Auth (login):** pola i CTA nie chowają się pod notchem; klawiatura nie zasłania przycisku logowania (Android `keyboardOnly` na `AppHost`).
- [ ] **formSheet** (`send-to`, `remove-friend`, `remove-avatar`, `friend-invite-confirm`): przyciski nad home indicator / gesture nav.
- [ ] **Kamera:** podgląd full-bleed; kontrolki nagrywania w safe area (góra/dół).
- [ ] **Bootstrap:** spinner startowy nie nachodzi na status bar przy długim ładowaniu sesji.

### Uwierzytelnianie (e-mail + hasło)

- [ ] Login: natywny `FieldGroup` (bez RN karty/ScrollView); ikona marki, tagline, pola z autofill (`autoComplete`).
- [ ] Login: klawiatura nie powoduje zagnieżdżonego scrolla (Android).
- [ ] Rejestracja: poprawny e-mail i hasło → ekran „sprawdź e-mail” / komunikat zgodny z konfiguracją Supabase.
- [ ] Po potwierdzeniu e-maila: logowanie prowadzi do onboardingu (nowy user) lub kart (istniejący).
- [ ] Logowanie: błędne hasło → komunikat `invalidCredentials`; niepotwierdzony e-mail → `emailNotConfirmed`.
- [ ] Reset hasła: link z e-maila otwiera aplikację (`nix://`) → nowe hasło zapisane → logowanie działa.
- [ ] Reset hasła OTP: kod recovery → `reset-password` → zapis hasła.
- [ ] Zmiana hasła z profilu (użytkownik e-mail+hasło).
- [ ] Maile auth mają branding NiX (ciemny szablon + OTP) — patrz [supabase-email-templates.md](./supabase-email-templates.md).

### Uwierzytelnianie (Sign in with Apple — iOS, urządzenie fizyczne)

- [ ] Nowy użytkownik Apple → onboarding username → `(tabs)`.
- [ ] Powtórny login Apple → `(tabs)` bez utraty danych.
- [ ] Anulowanie Apple → brak błędu na ekranie loginu.
- [ ] Profil Apple-only → brak wiersza „Zmień hasło”.
- [ ] Ten sam e-mail: konto e-mail i Apple = osobne konta.

Konfiguracja: [apple-sign-in-setup.md](./apple-sign-in-setup.md).

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

- [ ] Domyślnie: przy próbie screenshotu w viewerze — blokada / toast (iOS — urządzenie fizyczne zalecane; Android — wg wersji API i `expo-screen-capture`).
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
