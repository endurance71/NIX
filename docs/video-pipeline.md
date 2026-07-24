# Pipeline multimediów (zdjęcie i wideo)

> **Wyznacznik platformowy:** Kamera, kompresja, odtwarzanie i miniatury opierają się na **modułach z mostem natywnym** (`expo-camera`, `expo-video`, `expo-image-manipulator`, `react-native-compressor`) — nie na rozwiązaniach webowych ani czysto JS. Zasada ogólna: [native-platform-guidelines.md](./native-platform-guidelines.md).

## Kamera (`src/app/(tabs)/index.tsx`)

- **Zdjęcie:** krótki tap na migawkę.
- **Wideo:** przytrzymanie — po progu [`VIDEO_HOLD_THRESHOLD_MS`](../src/lib/videoRecordingLimits.ts) (**500 ms**) start nagrania; krótszy kontakt = zdjęcie.
- **Limit czasu:** pojedynczy klip do **180 s** (`VIDEO_TOTAL_MAX_DURATION_MS`); po przytrzymaniu kamera przełącza się w tryb `video`, czeka na nowe `onCameraReady`, a dopiero potem startuje `recordAsync`.
- **Bitrate nagrania:** ~2.5 Mbps (`VIDEO_RECORDING_BITRATE`); limit rozmiaru pliku podczas nagrywania ~90 MB (strażnik kamery) — finalny limit uploadu patrz niżej.
- **Mikrofon:** możliwość nagrywania bez dźwięku (mute) przy użyciu `CameraView`.
- **Telemetria:** m.in. `photo_capture_ms`, `photo_preview_nav_ms`, `video_record_ms`, `camera_switch_*`.

Stan roboczy między ekranami:
- Wideo: [`src/context/VideoDraftContext.tsx`](../src/context/VideoDraftContext.tsx) (`segments`).
- Zdjęcie: [`src/context/PhotoDraftContext.tsx`](../src/context/PhotoDraftContext.tsx) (`uri`) — **nie** przez query params routera (unika uszkodzenia `file://`).

Po migawce: `setPhotoUri(photo.uri)` + natychmiastowy `router.push('/preview')`. Kompresja JPEG jest dopiero przy wysyłce w `mediaService`.

## Preview (`src/app/preview.tsx`)

- Tryb foto czyta URI z `PhotoDraft` (fallback: params `uri`).
- Tryb wideo czyta segmenty z `VideoDraft`.
- Wybór **czasu wyświetlania** u odbiorcy (`view_duration_sec`): 5 / 15 / 30 / 60 / 180 (`ALLOWED_VIEW_DURATIONS` w nixService).
- Chrome preview: `chromeVariant="solid"` (bez Liquid Glass — unika ambient dimming na iOS 26).
- Przygotowanie pliku i metadanych przed wysyłką — orchestracja w [`src/services/mediaService.ts`](../src/services/mediaService.ts).

## Kompresja

- Zdjęcia: `expo-image-manipulator`.
- Wideo: `react-native-compressor` z fallbackiem do oryginału.
- **Fast-path:** lokalne nagrania **≤ 10 MB** mogą pominąć rekompresję — event `compression_skipped` (oszczędność CPU/baterii).

## Limity rozmiaru

- **Klient (wysyłka wideo):** `MAX_VIDEO_FILE_SIZE_BYTES = 100 MB` w `mediaService`.
- **Bucket Supabase `media-vault`:** do **400 MB** na plik (skrypt SQL).

## Miniatura embed (`thumbnail_b64`)

- Generowana dla **wideo** po stronie nadawcy (`expo-video.generateThumbnailsAsync` + `expo-image-manipulator`).
- Zapisywana jako **data URL** JPEG w kolumnie `nixes.thumbnail_b64`.
- Limit rozmiaru stringa w DB: **60 000 bajtów** (check w SQL) — ~45 KB binarnie po stronie produktu.
- Telemetria: `thumbnail_b64_size_bytes`, `thumbnail_b64_skipped`, `thumbnail_b64_variant_failed`.
- Jeśli kolumna nie istnieje w starszym środowisku — insert bez pola (fallback w kodzie).

## Upload

- **Obrazy / małe pliki:** standardowa ścieżka uploadu do Storage.
- **Wideo (resumable):** [`src/services/resumableUploadService.ts`](../src/services/resumableUploadService.ts) — `tus-js-client`, chunk **6 MB** (limit Supabase TUS), odczyt fragmentów przez `expo-file-system/legacy.readAsStringAsync` (base64) aby utrzymać RAM ~14–20 MB szczytowo.
- Eventy: `resumable_upload_started`, `resumable_upload_success_ms`, `resumable_upload_failure`, `resumable_upload_retry`, `resumable_upload_non_retryable`, `resumable_upload_existing_resource`.

## Rekord `nixes`

- `insertNix` w [`src/services/nixService.ts`](../src/services/nixService.ts): `client_upload_id` dla idempotencji (unikalny indeks częściowy), `media_type`, `playback_duration_ms`, `thumbnail_b64`, `view_duration_sec`, `status: sent`.
- Obsługa brakujących kolumn w starszych bazach — retry insertów bez opcjonalnych pól.

## Viewer (`src/app/viewer.tsx`)

- Dla wideo z `thumbnail_b64` — natychmiastowy pierwszy frame (`viewer_thumbnail_source`: `embedded` / `missing`).
- Potem signed URL do pełnego pliku; metryki `viewer_signed_url_ms`, `viewer_media_ready_ms`.

Powiązany audyt wydajności: [performance-reaudit.md](performance-reaudit.md).
