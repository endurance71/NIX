# NiX Performance Re-Audit

## Zakres Ponownego Audytu
Audyt należy wykonać po wdrożeniu i smoke testach na urządzeniu iOS. Obejmuje te same obszary co pierwszy przegląd:

1. Kamera i nagrywanie wideo.
2. Kompresja mediów.
3. Upload do Supabase Storage.
4. Download i viewer mediów.
5. Profile, inbox i listy użytkowników.
6. iOS performance i pamięć.
7. Metryki i monitoring.
8. Architektura i jakość kodu.

## Wyniki Implementacji Do Sprawdzenia
- Timer nagrywania działa przez Reanimated, a JS aktualizuje tylko tekst sekund.
- Kamera raportuje `camera_ready_ms`, foto `photo_capture_ms`, a wideo `video_record_ms`.
- Zdjęcia są kompresowane przez `expo-image-manipulator`.
- Wideo używa `react-native-compressor` z fallbackiem do oryginału.
- Upload ma retry, status jobów, cancel signal i progress fazowy.
- `expo-image` ma limit cache i cleanup przy memory warning.
- Inbox/sent/friends mają limity po stronie klienta, a SQL setup zawiera paginowane RPC.
- Sentry jest inicjalizowane warunkowo przez `EXPO_PUBLIC_SENTRY_DSN`.

## Porównanie Przed/Po
Status po implementacji kodowej:

- `npm run typecheck`: przechodzi.
- `npm test`: 9 plików testów, 53 testy przechodzą.
- `expo lint` oraz zawężony `eslint` zawiesiły się bez diagnostyki; diagnostyka IDE dla zmienionych plików nie pokazuje błędów.
- Metryki runtime p50/p95 wymagają testów na fizycznym iPhonie po uruchomieniu aplikacji z nowymi eventami telemetry.

Do uzupełnienia po testach urządzeniowych:

- `camera_ready_ms` p50/p95.
- `compression_ms` foto p50/p95.
- `compression_ms` wideo p50/p95.
- Średni spadek rozmiaru wideo.
- `upload_ms` p50/p95.
- Failed upload rate.
- Memory warnings lub crashe.
- Viewer media ready p50/p95.

## Ryzyka Pozostałe
- Background upload wymaga dodatkowej decyzji produktowej oraz testów iOS background modes.
- Paginowane RPC są dodane do SQL setup, ale UI używa obecnie limitów i może wymagać pełnego infinite scroll w kolejnej iteracji.

## Video pipeline v2 (maj 2026)

Druga iteracja optymalizacji wideo zmienia trzy kluczowe miejsca pipeline'u nadawca→odbiorca, eliminując ryzyko OOM dla dużych plików oraz skracając Time To First Pixel u odbiorcy.

### Co się zmieniło
- **Resumable (TUS) upload wideo.** [src/services/resumableUploadService.ts](../src/services/resumableUploadService.ts) korzysta z `tus-js-client` z własnym `fileReader`/`FileSource` opartym na `expo-file-system/legacy.readAsStringAsync({ encoding: 'base64', position, length })`. Body wysyłane chunkami po 6 MB (limit Supabase TUS), zatem szczyt RAM dla wideo to ~14–20 MB niezależnie od rozmiaru pliku.
- **`uploadVideoAndCreateSnap` bez `getImageBytes`.** [src/services/mediaService.ts](../src/services/mediaService.ts) waliduje rozmiar przez metadane systemu plików (`prepared.sizeBytes` / `originalSizeBytes`) jeszcze przed jakimkolwiek odczytem zawartości. `MAX_VIDEO_FILE_SIZE_BYTES = 100 MB`.
- **Embedded miniatura JPEG (`snaps.thumbnail_b64`).** Generowana lokalnie po stronie nadawcy (`expo-video.generateThumbnailsAsync` + `expo-image-manipulator` 240 px @ q=0.55, fallback 200 px @ q=0.4). Trafia jako data URL bezpośrednio do wiersza `snaps`. Twardy limit 45 KB binarki, egzekwowany w SQL (`CHECK octet_length <= 60000`).
- **Viewer bez zdalnego thumbnaila.** [src/app/viewer.tsx](../src/app/viewer.tsx) usuwa `getThumbnailAsync(signedUrl)` na rzecz natychmiastowego renderu `currentSnap.thumbnail_b64` jeszcze przed pobraniem signed URL. Wraz z `nextSnap.thumbnail_b64` z queue daje płynne przewijanie bez parsowania zdalnego strumienia wideo.
- **Fast-path kompresji.** Lokalne nagrania ≤ 10 MB pomijają `react-native-compressor` (nagrania z kamery są już ograniczone bitratem 2.5 Mbps, więc rekompresja przynosiłaby śladowy zysk za istotny koszt CPU/baterii). Telemetria: `compression_skipped`.

### Schemat (dev/staging) — ALTER TABLE
Migracja w [docs/supabase_setup.sql](supabase_setup.sql):

- `snaps.thumbnail_b64 TEXT` (idempotent),
- `snaps_thumbnail_b64_size CHECK (octet_length(thumbnail_b64) <= 60000)`,
- `prevent_snap_payload_update` rozszerzony o `thumbnail_b64` jako pole immutable po insercie.

### Nowe eventy telemetrii
- `compression_skipped` — fast-path nagrań ≤ 10 MB.
- `thumbnail_b64_size_bytes`, `thumbnail_b64_skipped`, `thumbnail_b64_variant_failed` — diagnostyka miniatur embed.
- `resumable_upload_started`, `resumable_upload_success_ms`, `resumable_upload_failure`, `resumable_upload_retry`, `resumable_upload_non_retryable` — pełen cykl życia uploadu TUS.
- `viewer_thumbnail_source` (`embedded` / `missing`) — udział starych snapów bez `thumbnail_b64` u odbiorcy.

### Metryki do potwierdzenia po release
- `compression_ms` p50/p95 dla wideo (z rozbiciem na `status: success | skipped | fallback`).
- `resumable_upload_success_ms` p50/p95 vs poprzedni `upload_ms`.
- Maks. RAM w trakcie uploadu wideo (instrumentacja Xcode/Android Profiler).
- Time To First Pixel dla wideo: czas od `viewer_thumbnail_source: embedded` do `viewer_media_ready_ms`.
- Failure rate `resumable_upload_failure` w podziale na sieć (4G/Wi-Fi) i platformę.

### Backward compatibility
- `insertSnap` posiada fallback `isMissingThumbnailColumnError` (analogiczny do `client_upload_id`) — apka działa poprawnie na środowiskach bez wykonanej migracji.
- `fetchInboxSnaps` i `fetchUnreadInboxQueueFromSender` mają retry-select bez `thumbnail_b64`, gdy kolumna jest nieobecna.
- Limit pliku wideo podniesiony do 100 MB; klipy z poprzednich wersji są kompatybilne.
