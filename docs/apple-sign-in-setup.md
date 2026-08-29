# Sign in with Apple — konfiguracja zewnętrzna

Checklista konfiguracji Apple Developer Portal i Supabase Dashboard dla natywnego logowania iOS (bez OAuth web flow).

## Apple Developer Portal

1. **Identifiers → App IDs** → `com.damianmotylinski.nixapp`
   - Włącz capability **Sign in with Apple**
2. Dodaj do Supabase wszystkie Client IDs używane w buildach:
   - `com.damianmotylinski.nixapp` — produkcja / dev build
   - `host.exp.Exponent` — testy przez Expo Go (opcjonalnie)
   - warianty EAS (`.dev`, `.preview`) jeśli istnieją

Native-only logowanie **nie wymaga** Services ID. Klucz `.p8` jest potrzebny wyłącznie po stronie Edge Function `delete-account` do wymiany authorization code i revoke (nie w kliencie, nie w `EXPO_PUBLIC_*`).

## Supabase Dashboard (produkcja)

1. **Authentication → Providers → Apple** → **Enable**
2. **Client IDs:** wpisz bundle ID-y oddzielone przecinkami, np.:
   ```
   com.damianmotylinski.nixapp,host.exp.Exponent
   ```
3. **Redirect URLs:** zachowaj `nix://auth/callback` (spójność z e-mail auth)
4. **Nonces mismatch** to błąd konfiguracji (Client ID / bundle / nonce SHA-256),
   nie sygnał do wyłączenia weryfikacji. Nie ustawiaj
   `GOTRUE_APPLE_SKIP_NONCE_CHECK`. Klient nigdy nie ponawia `signInWithIdToken`
   bez nonce.

## Lokalny Supabase

W [`supabase/config.toml`](../supabase/config.toml):

```toml
[auth.external.apple]
enabled = true
client_id = "com.damianmotylinski.nixapp,host.exp.Exponent"
```

## Weryfikacja

- [ ] Provider Apple włączony w Supabase (cloud)
- [ ] Client IDs zawierają bundle używany w buildzie testowym
- [ ] Test na **urządzeniu fizycznym** iOS (nie symulator)
- [ ] Nowy użytkownik Apple → onboarding username → `(tabs)`
- [ ] Powtórny login Apple → `(tabs)` bez utraty danych
- [ ] Profil Apple-only **bez** wiersza „Zmień hasło”

## Sekrety serwerowe (delete-account)

Ustaw wyłącznie w Supabase Secrets funkcji, nigdy w Git, logach ani `EXPO_PUBLIC_*`:

- `APPLE_TEAM_ID` — 10-znakowy Team ID
- `APPLE_KEY_ID` — 10-znakowy Key ID klucza Sign in with Apple
- `APPLE_CLIENT_ID` — dokładnie bundle ID iOS (`com.damianmotylinski.nixapp`), bez listy przecinkowej
- `APPLE_PRIVATE_KEY` — zawartość pliku `.p8` w formacie PKCS#8 (`BEGIN PRIVATE KEY`)

Client secret JWT jest generowany per request (ES256, TTL 5 minut). Authorization code jest jednorazowy i ważny pięć minut; backend go nie zapisuje.

Brak któregokolwiek sekretu **blokuje** usunięcie konta Apple (fail-closed). Konta e-mail+hasło nie używają tych sekretów.

`delete-account` v5 jest wdrożony z `verify_jwt = true`. Kontrolowany test
urządzeniowy Sign in with Apple na development lub TestFlight **pozostaje
otwarty** (P0-4 DEVICE TEST DEFERRED). To nie są konta Sandbox Apple (te
dotyczą głównie StoreKit/IAP i Apple Pay). Sign in with Apple używa normalnej
konfiguracji App ID, Apple Account i rzeczywistych endpointów REST
(`/auth/token`, `/auth/revoke`).

## Test urządzeniowy usuwania konta (otwarty)

Na fizycznym iPhonie, po ustawieniu sekretów i wdrożeniu `delete-account`
(jeszcze nie wykonane):

1. Poprawne usunięcie konta z identity Apple (świeży sheet Sign in with Apple).
2. Konto bez identity Apple (e-mail+hasło) — bez kodu Apple, pełny cleanup.
3. Identity Apple bez `authorizationCode` — 400, brak cleanupu.
4. Zużyty albo błędny kod — fail-closed, konto zostaje.
5. Błąd Apple (revoke/exchange) — brak cleanupu bazy, storage i `auth.users`.

Po sukcesie zapisz dowody bez danych użytkowników: brak `auth.users` / profilu / powiązanych nixów, puste własne prefiksy `media-vault/nixes/<userId>` i `avatars/<userId>`, zachowany asset używany przez innego odbiorcę, kwalifikacja ostatniego osieroconego assetu przez `mark_expired_media_uploads` / cron, brak kodów i tokenów w logach.

## Zmienne środowiskowe aplikacji

Bez dodatkowych kluczy Apple po stronie klienta — wystarczają:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
