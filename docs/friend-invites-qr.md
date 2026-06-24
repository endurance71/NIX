# Zaproszenia znajomych przez QR

> **Wyznacznik platformowy:** Skan QR i uprawnienia kamery korzystają z **natywnego stacku** (`expo-camera`, uprawnienia per platforma w `app.json` / `ios/` / `android/`). UI ekranów QR — `@expo/ui` tam gdzie to możliwe. Zasada ogólna: [native-platform-guidelines.md](./native-platform-guidelines.md).

## Model danych

Tabela `friend_invites` (patrz [supabase_setup.sql](supabase_setup.sql)):

- `created_by` — kto wygenerował zaproszenie
- `token_hash` — **MD5** jawnego tokenu (plaintext nie jest przechowywany)
- `channel` — wyłącznie `'qr'`
- `expires_at` — TTL (**5 minut** od utworzenia)
- `used_at`, `used_by` — jednorazowe zrealizowanie

## RPC

### `create_friend_invite(invite_channel text)`

- Wymaga `auth.uid()`.
- Akceptuje tylko kanał `'qr'` (case-insensitive trim).
- Generuje długi token losowy, zapisuje hash, zwraca `(invite_token, expires_at)` dla wyświetlenia w QR.

### `redeem_friend_invite(invite_token text)`

Wynik biznesowy (`result`):

| result | Znaczenie |
| :--- | :--- |
| `request_sent` | Utworzono `friendships` pending od aktualnego użytkownika do zapraszającego |
| `accepted_reverse_request` | Było oczekujące zaproszenie od drugiej strony — ustawiono `accepted` |
| `already_friends` | Para już w statusie `accepted` |
| `already_requested` | Aktualny użytkownik już wysłał pending do zapraszającego |

Błędy: token niepoprawny / wygasły / zużyty, redeem przez siebie, brak sesji.

## Deep link

[`src/lib/deepLink.ts`](../src/lib/deepLink.ts): URL z tokenem lub `profileId` → `router.push` na `/friend-invite` z parametrami.

Ekstrakcja payloadu: [`src/lib/friendInvite.ts`](../src/lib/friendInvite.ts).

## Ekrany

| Route | Plik | Rola |
| :--- | :--- | :--- |
| `friend-my-code` | `src/app/friend-my-code.tsx` | Pokazanie własnego kodu / QR |
| `friend-scan-qr` | `src/app/friend-scan-qr.tsx` | Skan (z telemetrią `friend_qr_scan`) |
| `friend-invite` | `src/app/friend-invite.tsx` | Wejście z linku / deep link |
| `friend-invite-confirm` | `src/app/friend-invite-confirm.tsx` | Potwierdzenie redeem (`friend_invite_redeem`) |

Rejestracja w stacku: [`src/app/_layout.tsx`](../src/app/_layout.tsx).

## Znajomi bez QR

Wyszukiwanie po `@username`, zaproszenia bezpośrednie — logika w [`src/services/friendService.ts`](../src/services/friendService.ts) i ekranie profilu.
