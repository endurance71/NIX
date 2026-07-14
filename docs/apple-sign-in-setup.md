# Sign in with Apple — konfiguracja zewnętrzna

Checklista konfiguracji Apple Developer Portal i Supabase Dashboard dla natywnego logowania iOS (bez OAuth web flow).

## Apple Developer Portal

1. **Identifiers → App IDs** → `com.damianmotylinski.nixapp`
   - Włącz capability **Sign in with Apple**
2. Dodaj do Supabase wszystkie Client IDs używane w buildach:
   - `com.damianmotylinski.nixapp` — produkcja / dev build
   - `host.exp.Exponent` — testy przez Expo Go (opcjonalnie)
   - warianty EAS (`.dev`, `.preview`) jeśli istnieją

Native-only **nie wymaga** Services ID ani klucza `.p8` (rotacja co 6 miesięcy dotyczy OAuth web).

## Supabase Dashboard (produkcja)

1. **Authentication → Providers → Apple** → **Enable**
2. **Client IDs:** wpisz bundle ID-y oddzielone przecinkami, np.:
   ```
   com.damianmotylinski.nixapp,host.exp.Exponent
   ```
3. **Redirect URLs:** zachowaj `nix://auth/callback` (spójność z e-mail auth)
4. Jeśli wystąpi błąd **Nonces mismatch** mimo retry w aplikacji:
   - w hosted Supabase włącz `GOTRUE_APPLE_SKIP_NONCE_CHECK=true` (tylko jako fallback)

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

## Zmienne środowiskowe aplikacji

Bez dodatkowych kluczy Apple po stronie klienta — wystarczają:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
