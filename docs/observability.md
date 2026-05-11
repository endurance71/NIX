# Observability (telemetria, Sentry, logi)

## Warstwa telemetrii

[`src/lib/telemetry.ts`](../src/lib/telemetry.ts):

- `trackEvent(name, payload)` — event z payloadem (wartości proste; `undefined` odfiltrowane).
- `trackDuration(name, startedAtMs, payload)` — dodaje `duration_ms`.
- `withTelemetrySpan` — opakowanie async z `status: success | failure`.
- **Domyślnie (dev, bez Sentry):** log `console.info('[telemetry]', ...)`.
- **Produkcja z DSN:** sink podpięty w monitoringu (breadcrumb).

## Sentry

[`src/lib/monitoring.ts`](../src/lib/monitoring.ts):

- Inicjalizacja przy starcie aplikacji (`initMonitoring` z `_layout.tsx`).
- Zmienna: **`EXPO_PUBLIC_SENTRY_DSN`** — jeśli pusta, Sentry nie startuje.
- Każdy event telemetrii → `Sentry.addBreadcrumb({ category: 'telemetry', ... })`.
- `payload.status === 'failure'` → dodatkowo `Sentry.captureMessage`.

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

Telemetria nie powinna zawierać tokenów, ścieżek z UUID poza kontrolowanymi identyfikatorami biznesowymi ani treści mediów. Payloady są „best-effort” sanityzowane w kodzie wywołań.
