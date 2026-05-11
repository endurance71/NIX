# Uwierzytelnianie (e-mail + hasło)

## Aktywny model

- **Rejestracja:** `supabase.auth.signUp({ email, password })` — Supabase wysyła link potwierdzający (konfiguracja projektu Supabase Auth).
- **Logowanie:** `signInWithPassword({ email, password })`.
- **Wylogowanie:** `signOut()`.
- **Reset hasła:** `resetPasswordForEmail(email, { redirectTo })` — redirect musi prowadzić do aplikacji ze scheme `nix://`.
- **Zmiana hasła (zalogowany):** aktualizacja hasła przez klienta Supabase po walidacji starego hasła (ekran `change-password`).

## Deep link `nix://`

Komponent [`src/lib/deepLink.ts`](../src/lib/deepLink.ts):

1. Parsuje `access_token` i `refresh_token` z **hash** lub **query** URL.
2. Wywołuje `supabase.auth.setSession({ access_token, refresh_token })`.
3. Jeśli `type === recovery`, nawigacja do `/(auth)/reset-password`.

Schemat aplikacji: `nix` (patrz `app.json`).

## Profil po rejestracji

Trigger `handle_new_user` na `auth.users` (w [supabase_setup.sql](supabase_setup.sql)) wstawia pusty wiersz `profiles(id)` bez `username`.

- **Onboarding:** jednorazowy wybór `username` (minimum 3 znaki, unikalność case-insensitive).
- **Trigger `prevent_username_change`:** po ustawieniu `username` zmiana jest zablokowana.

## Ekrany (Expo Router)

| Ścieżka | Plik | Rola |
| :--- | :--- | :--- |
| `/login` | `src/app/(auth)/login.tsx` | Logowanie |
| `/register` | `src/app/(auth)/register.tsx` | Rejestracja |
| `/check-email` | `src/app/(auth)/check-email.tsx` | Informacja po rejestracji |
| `/forgot-password` | `src/app/(auth)/forgot-password.tsx` | Prośba o reset |
| `/reset-password` | `src/app/(auth)/reset-password.tsx` | Nowe hasło po linku |
| `/onboarding` | `src/app/(auth)/onboarding.tsx` | Username |
| `/profile/change-password` | `src/app/(tabs)/profile/change-password.tsx` | Zmiana hasła |

Routing chroniony: [`src/app/_layout.tsx`](../src/app/_layout.tsx) — bez sesji → `(auth)/login`; z sesją bez `username` → `onboarding` (z wyjątkiem reset hasła).

## Edge cases (mapowanie na UX)

Komunikaty użytkownika często pochodzą z kluczy i18n w [`src/lib/i18n.ts`](../src/lib/i18n.ts):

| Sygnatura | Zachowanie |
| :--- | :--- |
| Niepotwierdzony e-mail | `emailNotConfirmed` — monit o potwierdzenie skrzynki |
| Złe dane logowania | `invalidCredentials` |
| Słabe hasło / walidacja formularza | `passwordMin`, `passwordMismatch`, `invalidEmail` |
| Rejestracja na istniejący e-mail | `accountExists` |

## Następny etap (nieaktywny)

Sign in with Apple — po uzyskaniu Apple Developer Account i konfiguracji Supabase Auth providera (patrz [NiX_Documentation_v1.2.md](NiX_Documentation_v1.2.md)).
