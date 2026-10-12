# Szablony e-mail Supabase Auth (NiX)

Branded HTML maile auth dla rejestracji, resetu hasła, reautoryzacji i powiadomień bezpieczeństwa.

## Generator (źródło prawdy)

Szablony **generuje** [`scripts/generate-email-templates.mjs`](../scripts/generate-email-templates.mjs) w stylu
nix.shipapp.pl (szare tła systemowe, kafel marki, przycisk-pigułka, jasny i ciemny motyw). Nie edytuj
plików `supabase/templates/*.html` ręcznie:

```bash
npm run generate:email-templates   # zapisuje 7 szablonów
npm run check:email-templates      # sprawdza, czy pliki są aktualne
```

- Języki: PL (gdy `.Data.language`/`.Data.locale` = `pl`) i EN dla pozostałych — jak w aplikacji.
- Główny element to 6-cyfrowy kod (`{{ .Token }}`). Przycisk z linkiem jest tylko w `confirmation`
  i `recovery`, bo aplikacja przyjmuje link `/auth/confirm` wyłącznie dla `signup` i `recovery`
  (`src/lib/authDeepLink.ts`). Link wskazuje `nix.damianmotylinski.pl` — tę domenę obsługują
  Universal Links w obecnym buildzie.
- Logo: `https://nix.shipapp.pl/apple-touch-icon.png`; stopka: Pomoc i Prywatność na nix.shipapp.pl.

## Stan produkcji (sprawdzone 2026-10-12)

- Własny SMTP **wyłączony** — wysyłka przez wbudowany serwer Supabase, limit **2 e-maile/h** na cały
  projekt, nadawca Supabase. Do wydania potrzebny własny SMTP (nadawca `nix@shipapp.pl`).
- Na produkcji są starsze szablony (ciemne, temat np. „Reset hasła — NiX”). Nowe trzeba wgrać.
- Site URL `http://127.0.0.1:3000`; Redirect URLs: `nix://auth/callback` + lokalne.

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
| `{{ .TokenHash }}` | Link potwierdzenia / resetu: `https://nix.damianmotylinski.pl/auth/confirm?token_hash={{ .TokenHash }}&type=signup\|recovery`. `{{ .ConfirmationURL }}` nie jest używany (niósł tokeny sesji w URL). |
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

- **Authentication → URL Configuration:** `nix://auth/callback` w Redirect URLs (pozostaje dla zgodności; szablony go nie używają)
- **Authentication → Email Templates:** podgląd HTML (6 auth + notifications)
- **Authentication → Emails:** opcjonalnie Sender name „NiX”

Wysyłka: domyślna Supabase (bez własnego SMTP) — patrz „Stan produkcji”.

> Uwaga: `npx supabase config push` wypycha **cały** `config.toml` (także lokalne wartości, np. limity).
> Bezpieczniej wgrać same szablony przez Dashboard (Authentication → Emails → Templates) albo Management API.

## Uwaga o ścieżkach `content_path`

- `[auth.email.template.*]` — ścieżka względem **root repozytorium** (`./supabase/templates/...`)
- `[auth.email.notification.*]` — ścieżka względem katalogu **`supabase/`** (`./templates/...`)

## Checklist smoke (produkcja)

- [ ] Rejestracja PL → mail z brandingiem NIX + link + OTP → onboarding
- [ ] Reset hasła → mail recovery → deep link lub OTP → nowe hasło
- [ ] Zmiana hasła w profilu → mail reauth z kodem OTP
- [ ] Po zmianie hasła → notification „Hasło zostało zmienione”

Powiązane: [auth-flow.md](auth-flow.md)
