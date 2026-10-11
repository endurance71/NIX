# Uwierzytelnianie (e-mail + hasło + Apple)

> **Wyznacznik platformowy:** Ekrany auth używają natywnych formularzy `@expo/ui` (`AuthFormLayout`, `FieldGroup`, `TextInput`) — nie generycznych pól RN. Layout: [development-workflow.md](development-workflow.md), zasada ogólna: [native-platform-guidelines.md](native-platform-guidelines.md).

## Aktywny model

- **Rejestracja:** `supabase.auth.signUp({ email, password })` — Supabase wysyła link potwierdzający (konfiguracja projektu Supabase Auth).
- **Logowanie:** `signInWithPassword({ email, password })`.
- **Logowanie Apple (iOS):** `expo-apple-authentication` → `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })` — implementacja w [`src/services/socialAuthService.ts`](../src/services/socialAuthService.ts). `nonce` jest obowiązkowy; mismatch jest błędem i nie powoduje ponowienia bez nonce.
- **Usuwanie konta Apple:** natywna autoryzacja zwraca świeży `authorizationCode`. Klient **nie** wywołuje `signInWithIdToken`, nie zmienia sesji i nie loguje kodu. Kod idzie wyłącznie w body `delete-account`.
- **Usuwanie konta Apple (backend):** `delete-account` rozpoznaje identity `apple` wyłącznie z `auth.getUser()`. Dla takiego użytkownika wymaga `appleAuthorizationCode`, wymienia go przez `POST https://appleid.apple.com/auth/token`, weryfikuje podpis oraz `iss` / `aud` / `exp` / `sub` w `id_token`, porównuje `sub` z identity Apple w Supabase Auth (nie z `profiles.apple_id`) i dopiero po zgodności odwołuje `refresh_token` przez `/auth/revoke`. HTTP 200 z revoke — także dla tokenu wcześniej odwołanego — pozwala przejść do cleanupu bazy, storage i `delete user`. Mismatch albo brak wiarygodnego `sub` jest fail-closed: bez revoke, cleanupu i usunięcia. Konta bez identity Apple zachowują dotychczasowy przepływ bez kodu.
- **Wylogowanie:** `signOut()`.
- **Reset hasła:** `resetPasswordForEmail(email, { redirectTo })` → ekran `reset-password` wywołuje `updatePassword(newPassword)`.
- **Zmiana hasła (zalogowany, tylko e-mail+hasło):** ekran `change-password`; ukryty dla kont Apple-only (`userHasEmailPasswordIdentity`).

Konfiguracja Apple Developer + Supabase: [apple-sign-in-setup.md](apple-sign-in-setup.md).

**Szablony e-mail auth** (rejestracja, reset, reauth, powiadomienia): [supabase-email-templates.md](supabase-email-templates.md).

## Link z wiadomości e-mail

Przycisk w mailu potwierdzenia i resetu prowadzi do
`https://nix.damianmotylinski.pl/auth/confirm?token_hash=…&type=signup|recovery`
(universal link; AASA obejmuje `/auth/confirm*`). Bez zainstalowanej aplikacji
strona `web/invite/auth-confirm.html` prosi o wpisanie 6-cyfrowego kodu.

Komponent [`src/lib/deepLink.ts`](../src/lib/deepLink.ts) z parserem
[`src/lib/authDeepLink.ts`](../src/lib/authDeepLink.ts):

1. Przyjmuje wyłącznie `/auth/confirm` (https lub `nix://auth/confirm`) z `token_hash` i typem `signup` albo `recovery`.
2. **Nigdy** nie przyjmuje `access_token`/`refresh_token` z URL i nie wywołuje `setSession` — spreparowany link nie może podmienić sesji.
3. Gdy użytkownik jest już zalogowany, link jest ignorowany (komunikat „wyloguj się”).
4. Inaczej wywołuje `supabase.auth.verifyOtp({ token_hash, type })`; `recovery` prowadzi do `/(auth)/reset-password`.

`src/app/+native-intent.tsx` zatrzymuje router na `/` dla tych linków. Kod OTP w `check-email` działa niezależnie od linku.

## Profil po rejestracji

Trigger `handle_new_user` na `auth.users` (w [supabase_setup.sql](supabase_setup.sql)) wstawia pusty wiersz `profiles(id)` bez `username`.

- **Onboarding:** jednorazowy wybór `username` (minimum 3 znaki, unikalność case-insensitive) — także po pierwszym logowaniu Apple.
- **Trigger `prevent_username_change`:** po ustawieniu `username` zmiana jest zablokowana.
- **Apple ID:** opcjonalny zapis `profiles.apple_id` przy pierwszym logowaniu Apple.

## Ekrany (Expo Router)

| Ścieżka | Plik | Rola |
| :--- | :--- | :--- |
| `/login` | `src/app/(auth)/login.tsx` | Logowanie (e-mail + Apple) |
| `/register` | `src/app/(auth)/register.tsx` | Rejestracja |
| `/check-email` | `src/app/(auth)/check-email.tsx` | Informacja po rejestracji / recovery OTP |
| `/forgot-password` | `src/app/(auth)/forgot-password.tsx` | Prośba o reset |
| `/reset-password` | `src/app/(auth)/reset-password.tsx` | Nowe hasło po linku / OTP |
| `/onboarding` | `src/app/(auth)/onboarding.tsx` | Username |
| `/profile/change-password` | `src/app/(tabs)/profile/change-password.tsx` | Zmiana hasła (tylko e-mail) |

Routing chroniony: [`src/app/_layout.tsx`](../src/app/_layout.tsx) — bez sesji → `(auth)/login`; z sesją bez `username` → `onboarding` (z wyjątkiem reset hasła).

## Sign in with Apple (iOS)

Przepływ:

1. Użytkownik klika oficjalny `AppleAuthenticationButton` na ekranie loginu.
2. Aplikacja generuje `rawNonce`, hash SHA-256 przekazuje do Apple.
3. Apple zwraca `identityToken` (+ `fullName` tylko przy pierwszym logowaniu).
4. Supabase tworzy / loguje użytkownika; trigger `handle_new_user` tworzy profil.
5. Gate routingu kieruje na onboarding (brak `username`) lub `(tabs)`.

**Decyzja produktowa:** konto e-mail i konto Apple z tym samym adresem to **osobne** rekordy `auth.users` (brak automatycznego linkowania).

**Testy:** wymagane urządzenie fizyczne iOS (symulator często nie obsługuje Apple ID poprawnie).

## Password AutoFill (iCloud Keychain)

- Entitlement + `app.json → ios.associatedDomains`: `webcredentials:nix.damianmotylinski.pl` (obok `applinks:`). To zmiana natywna — wymaga nowego binarium (Xcode Archive), OTA jej nie dostarczy.
- AASA (`web/invite/.well-known/apple-app-site-association`, hostowany na `https://nix.damianmotylinski.pl/.well-known/apple-app-site-association`) ma sekcję:
  ```json
  "webcredentials": { "apps": ["9Q39P5MUT9.com.damianmotylinski.nixapp"] }
  ```
  Po wgraniu pliku sprawdź CDN Apple: `https://app-site-association.cdn-apple.com/a/v1/nix.damianmotylinski.pl` (cache do ~24 h). Bez tego iOS nie podpowie zapisanych haseł dla domeny ani nie zaproponuje zapisu.
- Pola: logowanie `autoComplete="username"` (e-mail jako identyfikator konta) + `current-password`; rejestracja `username` + `new-password` (dwa pola — iOS proponuje silne hasło i zapisuje je pod tym e-mailem); reset hasła `new-password`. `@expo/ui` mapuje to na SwiftUI `textContentType`.

## Klucze dostępu (passkeys)

**Stan:** klient gotowy, domyślnie wyłączony (`EXPO_PUBLIC_PASSKEYS_ENABLED !== 'true'` → przycisk ukryty).

- `@supabase/supabase-js` 2.117.x ma API passkey (`supabase.auth.passkey.startAuthentication / verifyAuthentication / startRegistration / verifyRegistration`, endpointy `/auth/v1/passkeys/*`). `signInWithPasskey()` z biblioteki używa `navigator.credentials`, którego w RN nie ma — dlatego ceremonię WebAuthn wykonuje natywny moduł `modules/nix-passkeys` (ASAuthorization, `ASAuthorizationPlatformPublicKeyCredentialProvider`), a JSON W3C składa `src/lib/passkeys.ts`.
- Logowanie: przycisk „Zaloguj się kluczem dostępu” na ekranie logowania (`src/services/passkeyAuthService.ts → signInWithPasskey`). `verifyAuthentication` zapisuje sesję i emituje `SIGNED_IN`, więc `AuthProvider` obsługuje to jak logowanie hasłem. Zamknięcie arkusza systemowego nie pokazuje błędu.
- Stare binaria (bez modułu): `requireOptionalNativeModule` zwraca `null` → przycisk ukryty, OTA bezpieczne.
- **Do zrobienia przed włączeniem:**
  1. Supabase (hosted) Auth: włączyć passkeys i WebAuthn RP — odpowiednik `config.toml`:
     ```toml
     [auth.passkey]
     enabled = true
     [auth.webauthn]
     rp_display_name = "NiX"
     rp_id = "nix.damianmotylinski.pl"
     rp_origins = ["https://nix.damianmotylinski.pl"]
     ```
     (iOS podpisuje `clientDataJSON` z originem `https://<rp_id>`.)
  2. AASA z sekcją `webcredentials` (wyżej) na produkcyjnej domenie + nowe binarium z entitlementem i modułem (`pod install`).
  3. Punkt rejestracji klucza dla zalogowanego użytkownika: `registerPasskeyForCurrentUser()` jest gotowe, brakuje wiersza w Profil → Prywatność i bezpieczeństwo („Klucze dostępu”: dodaj / lista / usuń przez `supabase.auth.passkey.list/delete`). Bez tego nikt nie ma klucza, którym mógłby się zalogować.
  4. Build z `EXPO_PUBLIC_PASSKEYS_ENABLED=true`.
- Błędy (`passkeyErrorKey`): brak modułu → `auth.passkeyUnavailable`; passkeys wyłączone na serwerze → `auth.passkeyNotEnabled`; wygasłe wyzwanie → `auth.passkeyExpired`; nieznany klucz → `auth.passkeyNotRecognized`; reszta → `auth.passkeyFailed`.

## OAuth — Google (wstrzymane)

Pakiet i wewnętrzny kontrakt pozostają w kodzie, ale ekran logowania nie oferuje
Google. [`socialAuthService.signInWithGoogle`](../src/services/socialAuthService.ts)
jest stubem (`SOCIAL_AUTH_NOT_CONFIGURED`) i nie wysyła danych do Google.

## Edge cases (mapowanie na UX)

Komunikaty użytkownika pochodzą z kluczy i18n w [`src/lib/i18n.ts`](../src/lib/i18n.ts):

| Sygnatura | Zachowanie |
| :--- | :--- |
| Niepotwierdzony e-mail | `emailNotConfirmed` |
| Złe dane logowania | `invalidCredentials` |
| Słabe hasło / walidacja formularza | `passwordMin`, `passwordMismatch`, `invalidEmail` |
| Rejestracja na istniejący e-mail | `accountExists` |
| Anulowanie Apple | brak komunikatu błędu |
| Błąd Apple / brak tokena | `appleSignInFailed`, `appleSignInNoToken` |
| Nonces mismatch (GoTrue) | błąd konfiguracji; klient nie ponawia `signInWithIdToken` bez nonce |
