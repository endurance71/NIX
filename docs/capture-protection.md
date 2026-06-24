# Ochrona przed screenshotem i nagrywaniem ekranu (viewer)

> **Wyznacznik platformowy:** Blokada capture używa **`expo-screen-capture`** (API natywne per platforma). Zachowanie i skuteczność różnią się między iOS a Android — testuj na obu. Zasada ogólna: [native-platform-guidelines.md](./native-platform-guidelines.md).

## Semantyka produktowa

- **Odbiorca** decyduje, czy pozwala na capture treści **od konkretnego nadawcy** (znajomego).
- **Domyślnie:** `deny` — brak wpisu w `nix_capture_prefs` traktowany jako blokada.
- **Allow:** jawny wiersz z `capture_policy = 'allow'` dla pary `(owner_user_id = receiver, friend_user_id = sender)`.

## Baza danych

- Tabela `nix_capture_prefs` — patrz [supabase_setup.sql](supabase_setup.sql).
- RPC **`get_capture_policy_for_sender(sender_id uuid)`** — zwraca politykę **z perspektywy zalogowanego użytkownika** (odbiorcy) względem nadawcy; `COALESCE(..., 'deny')`.

## Warstwa aplikacji

| Moduł | Rola |
| :--- | :--- |
| [`src/services/capturePolicyService.ts`](../src/services/capturePolicyService.ts) | CRUD preferencji, wywołanie RPC |
| [`src/lib/capturePolicy.ts`](../src/lib/capturePolicy.ts) | `resolveCapturePolicyForFriend`, `shouldBlockCapture` |
| `src/app/viewer.tsx` | `expo-screen-capture`: `preventScreenCaptureAsync` gdy blokada; listener prób; klucz pomocniczy `viewer-capture-guard` |
| `src/app/(tabs)/profile/index.tsx` | Przełączniki per znajomy (React Query cache: `friendCapturePolicies`, `capturePolicyForSender`) |

## Telemetria (przykłady)

- `viewer_capture_policy_allow` — jawne zezwolenie dla nadawcy.
- `viewer_capture_block_enabled` — aktywowano blokadę w viewerze.
- `viewer_capture_attempt` — wykryta próba screenshotu/nagrywania (platforma zależna).

## Testy manualne

- **iOS:** checklista [capture_protection_ios_checklist.md](capture_protection_ios_checklist.md) (urządzenie fizyczne zalecane).
- **Android:** ten sam flow viewer + przełącznik capture w profilu; weryfikacja `expo-screen-capture` na docelowej wersji API.

**Ograniczenie:** pełna skuteczność capture API zależy od wersji systemu i polityki platformy (Apple / Google); dokumentacja opisuje zachowanie zaimplementowane w aplikacji, nie „kryptograficzną niemożność” zrzutu ekranu na każdym urządzeniu.
