# Edge Function `cleanup-nix`

> Klient wywołujący funkcję to **natywna aplikacja iOS/Android** (Expo bare). Zachowanie kolejki cleanupu testuj na obu platformach — [native-platform-guidelines.md](./native-platform-guidelines.md).

Lokalizacja kodu: [`supabase/functions/cleanup-nix/index.ts`](../supabase/functions/cleanup-nix/index.ts).

## Kontrakt HTTP

- **Metoda:** `POST`
- **Nagłówek:** `Authorization: Bearer <access_token>` (sesja użytkownika Supabase)
- **Body JSON:** `{ "nixId": "<uuid>", "mediaPath": "<ścieżka w bucket media-vault>" }`
- **Pomyślna odpowiedź (200):** co najmniej `{ "ok": true, ... }` — dokładny kształt zależy od ścieżki (np. `archived: true`, `reason: nix_not_found`)

Walidacja payloadu: helper `isValidCleanupPayload` (wymaga `nixId` i `mediaPath`).

## Logika (wysoki poziom)

1. Weryfikacja użytkownika przez **`anon` klient + JWT** (`auth.getUser()`).
2. Odczyt nixa przez **service role** (`id`, `receiver_id`, `media_path`, `is_viewed`).
3. **403** jeśli `nix.receiver_id !== user.id`.
4. **400** jeśli `mediaPath` nie zgadza się z rekordem.
5. Jeśli nix nie istnieje: usunięcie ewentualnego wpisu kolejki, audit `not_found`, `{ ok: true, deleted: false, reason: 'nix_not_found' }`.
6. Jeśli nie był viewed: próba ustawienia `is_viewed` + `viewed_at` (+ `status: viewed` jeśli kolumna istnieje).
7. **`storage.from('media-vault').remove([mediaPath])`**
   - przy błędzie: opcjonalnie `status: cleanup_failed`, upsert kolejki, audit `failed`, HTTP 500.
8. Przy sukcesie storage: aktualizacja `nixes` → `status: cleaned`, `cleaned_at`; usunięcie joba z kolejki; audit `success`.

> [!NOTE]
> W aktualnej implementacji rekord nixa jest **aktualizowany** (`cleaned`), a niekoniecznie **kasowany** z tabeli — zachowanie zależy od wersji schematu (obsługa starszych DB bez kolumny `status`).

## Audit

Wywołanie RPC `log_cleanup_audit` (service role) z statusami m.in. `queued`, `success`, `failed`, `not_found`, `forbidden`.

## Zmienne środowiskowe (sekrety funkcji)

| Zmienna | Rola |
| :--- | :--- |
| `SUPABASE_URL` | URL projektu |
| `SUPABASE_ANON_KEY` | Weryfikacja JWT użytkownika |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage delete, odczyt/mutacja nixów, audit |

Deploy przykładowy: `supabase functions deploy cleanup-nix`

## Po stronie klienta

[`src/services/nixService.ts`](../src/services/nixService.ts):

- `markNixViewedWithCleanup` — najpierw oznacza viewed, kolejka, potem `invoke('cleanup-nix')`.
- `flushCleanupQueue` — ponawianie zadań z `nix_cleanup_queue` z rosnącym backoffem (do ok. 15 min).

Powiązanie z README i runbookiem: [development-workflow.md](development-workflow.md).
