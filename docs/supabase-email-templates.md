# Szablony e-mail Supabase Auth (NiX)

Branded HTML maile auth dla rejestracji, resetu hasła, reautoryzacji i powiadomień bezpieczeństwa.

## Pliki szablonów

| Typ Supabase | Plik | Temat (subject) |
|--------------|------|-----------------|
| `confirmation` | [`supabase/templates/confirmation.html`](../supabase/templates/confirmation.html) | Potwierdź e-mail — NiX |
| `recovery` | [`supabase/templates/recovery.html`](../supabase/templates/recovery.html) | Reset hasła — NiX |
| `magic_link` | [`supabase/templates/magic_link.html`](../supabase/templates/magic_link.html) | Zaloguj się — NiX |
| `invite` | [`supabase/templates/invite.html`](../supabase/templates/invite.html) | Zaproszenie do NiX |
| `email_change` | [`supabase/templates/email_change.html`](../supabase/templates/email_change.html) | Potwierdź zmianę e-mail — NiX |
| `reauthentication` | [`supabase/templates/reauthentication.html`](../supabase/templates/reauthentication.html) | Kod weryfikacyjny — NiX |
| `password_changed` (notification) | [`supabase/templates/password_changed.html`](../supabase/templates/password_changed.html) | Hasło zostało zmienione — NiX |

Konfiguracja w [`supabase/config.toml`](../supabase/config.toml) — sekcje `[auth.email.template.*]` i `[auth.email.notification.password_changed]`.

## Język w mailach

Szablony używają `{{ .Data.language }}` / `{{ .Data.locale }}` (Go templates):

- **Rejestracja:** aplikacja wysyła locale w `signUp` ([`authService.ts`](../src/services/authService.ts)).
- **Reset hasła:** locale pochodzi z istniejącej metadata użytkownika (zapisanej przy rejestracji).
- **Reautoryzacja / powiadomienia:** metadata zalogowanego użytkownika.

Fallback: angielski, gdy brak locale PL.

## Zmienne szablonu

| Zmienna | Użycie |
|---------|--------|
| `{{ .ConfirmationURL }}` | Link aktywacyjny / reset (deep link `nix://auth/callback`) |
| `{{ .Token }}` | 6-cyfrowy kod OTP (ekran `check-email`, zmiana hasła) |
| `{{ .Email }}` | Adres użytkownika |
| `{{ .NewEmail }}` | Nowy adres (email_change) |
| `{{ .Data.locale }}` | Język z metadata użytkownika |

## Test lokalny

1. `supabase start` w katalogu projektu
2. Podgląd maili: **Inbucket** — http://127.0.0.1:54324
3. Wywołaj rejestrację / reset z aplikacji wskazującej na lokalny Supabase (opcjonalnie)

## Wdrożenie na produkcję (NiX cloud)

Projekt: `xjdjlxfulpqpundkcdul` (region `eu-west-1`).

```bash
npx supabase login
npx supabase link --project-ref xjdjlxfulpqpundkcdul
npx supabase config push
```

Wymaga zalogowania do Supabase CLI (`login` otwiera przeglądarkę). Hasło bazy może być wymagane przy `link` (Dashboard → Project Settings → Database).

Po push sprawdź w Dashboard:

- **Authentication → URL Configuration:** `nix://auth/callback` w Redirect URLs
- **Authentication → Email Templates:** podgląd HTML (6 auth + notifications)
- **Authentication → Emails:** opcjonalnie Sender name „NiX”

Wysyłka: domyślna Supabase (bez własnego SMTP).

## Uwaga o ścieżkach `content_path`

- `[auth.email.template.*]` — ścieżka względem **root repozytorium** (`./supabase/templates/...`)
- `[auth.email.notification.*]` — ścieżka względem katalogu **`supabase/`** (`./templates/...`)

## Checklist smoke (produkcja)

- [ ] Rejestracja PL → mail z brandingiem NIX + link + OTP → onboarding
- [ ] Reset hasła → mail recovery → deep link lub OTP → nowe hasło
- [ ] Zmiana hasła w profilu → mail reauth z kodem OTP
- [ ] Po zmianie hasła → notification „Hasło zostało zmienione”

Powiązane: [auth-flow.md](auth-flow.md)
