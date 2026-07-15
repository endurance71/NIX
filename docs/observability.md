# Observability (telemetria lokalna i logi)

> **Wyznacznik platformowy:** Przy analizie metryk uwzględniaj wymiar **platformy** (`ios` / `android`) — regresje native UI często są platform-specific. Zasada ogólna produktu: [native-platform-guidelines.md](./native-platform-guidelines.md).

## Warstwa telemetrii

[`src/lib/telemetry.ts`](../src/lib/telemetry.ts):

- `trackEvent(name, payload)` — event z payloadem (wartości proste; `undefined` odfiltrowane).
- `trackDuration(name, startedAtMs, payload)` — dodaje `duration_ms`.
- `withTelemetrySpan` — opakowanie async z `status: success | failure`.
- **Development:** log `console.info('[telemetry]', ...)`.
- **Produkcja:** brak zdalnego sinka; eventy nie opuszczają urządzenia.

## Sentry — tymczasowo twardo wyłączone

[`src/lib/monitoring.ts`](../src/lib/monitoring.ts):

- SDK `@sentry/react-native ~7.11.0`, plugin Expo, Metro i CocoaPods pozostają w projekcie.
- `SENTRY_RUNTIME_ENABLED = false` blokuje wysyłkę niezależnie od wartości DSN,
  a root layout nie korzysta z `Sentry.wrap`.
- Edge Functions mają osobną stałą hard-off przed odczytem `SENTRY_DSN` i `fetch`.
- Wszystkie profile EAS i fazy Xcode ustawiają `SENTRY_DISABLE_AUTO_UPLOAD=true`
  oraz `SENTRY_DISABLE_XCODE_DEBUG_UPLOAD=true`.
- `npm run check:sentry-disabled` kontroluje te warunki w CI. Ponowne włączenie
  wymaga osobnej decyzji, aktualizacji polityki prywatności, sekretów i testu PII/symbolikacji.

## Baza danych

- **`upload_logs`** — etapy uploadu, rozmiary, czasy kompresji/uploadu, błędy (RLS: nadawca/odbiorca przy SELECT).
- **`nix_cleanup_queue`** / **`nix_cleanup_audit`** — kolejka i audit cleanupu (patrz [cleanup-edge-function.md](cleanup-edge-function.md)).

## Dashboard SQL

Gotowe zapytania / widoki (dostosuj do swojego środowiska): [upload-observability-dashboard.sql](upload-observability-dashboard.sql).

## Przykładowe eventy (niekompletna lista)

| Event | Kontekst |
| :--- | :--- |
| `inbox_fetch_ms`, `sent_fetch_ms` | Skrzynka |
| `camera_ready_ms`, `photo_capture_ms`, `video_record_ms` | Kamera |
| `camera_switch_started`, `camera_switch_ready`, `camera_switch_timeout` | Zmiana kamery |
| `compression_skipped`, `thumbnail_b64_*` | Kompresja / miniatura |
| `resumable_upload_*` | TUS wideo |
| `viewer_thumbnail_source`, `viewer_signed_url_ms`, `viewer_media_ready_ms` | Viewer |
| `viewer_capture_*` | Capture policy |
| `friend_qr_scan`, `friend_invite_redeem` | Znajomi QR |

Pełna lista: wyszukanie `trackEvent(` / `trackDuration(` w `src/`.

## Prywatność

Telemetria nie może zawierać tokenów, adresów e-mail, podpisanych URL-i ani treści
mediów. Obecnie nie jest przekazywana do zewnętrznego procesora. Przed ewentualnym
włączeniem Sentry trzeba ponownie zatwierdzić filtr PII i retencję maksymalnie 30 dni.
