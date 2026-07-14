# Uwierzytelnianie (e-mail + hasło + Apple)

> **Wyznacznik platformowy:** Ekrany auth używają natywnych formularzy `@expo/ui` (`AuthFormLayout`, `FieldGroup`, `TextInput`) — nie generycznych pól RN. Layout: [development-workflow.md](development-workflow.md), zasada ogólna: [native-platform-guidelines.md](native-platform-guidelines.md).

## Aktywny model

- **Rejestracja:** `supabase.auth.signUp({ email, password })` — Supabase wysyła link potwierdzający (konfiguracja projektu Supabase Auth).
- **Logowanie:** `signInWithPassword({ email, password })`.
- **Logowanie Apple (iOS):** `expo-apple-authentication` → `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })` — implementacja w [`src/services/socialAuthService.ts`](../src/services/socialAuthService.ts).
- **Wylogowanie:** `signOut()`.
- **Reset hasła:** `resetPasswordForEmail(email, { redirectTo })` → ekran `reset-password` wywołuje `updatePassword(newPassword)`.
- **Zmiana hasła (zalogowany, tylko e-mail+hasło):** ekran `change-password`; ukryty dla kont Apple-only (`userHasEmailPasswordIdentity`).

Konfiguracja Apple Developer + Supabase: [apple-sign-in-setup.md](apple-sign-in-setup.md).

**Szablony e-mail auth** (rejestracja, reset, reauth, powiadomienia): [supabase-email-templates.md](supabase-email-templates.md).

## Deep link `nix://`

Komponent [`src/lib/deepLink.ts`](../src/lib/deepLink.ts):

1. Parsuje `access_token` i `refresh_token` z **hash** lub **query** URL.
2. Wywołuje `supabase.auth.setSession({ access_token, refresh_token })`.
3. Jeśli `type === recovery`, nawigacja do `/(auth)/reset-password`.

Schemat aplikacji: `nix` (patrz `app.json`).

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

## OAuth — Google (wstrzymane)

Ekran logowania ma przycisk Google, ale [`socialAuthService.signInWithGoogle`](../src/services/socialAuthService.ts) pozostaje stubem (`SOCIAL_AUTH_NOT_CONFIGURED`).

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
| Nonces mismatch (GoTrue) | automatyczny retry bez nonce w `socialAuthService` |
