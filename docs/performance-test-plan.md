# NiX Performance Test Plan

## Urządzenia
- iPhone 11 lub 12 jako minimalny target wydajności.
- Jeden nowszy iPhone jako punkt porównawczy.
- Testy na WiFi i LTE/ograniczonym połączeniu.

## Scenariusze
- Cold open kamery: zmierz `camera_ready_ms` po wejściu na tab kamery.
- Foto: capture, preview, send-to, upload, viewer, cleanup.
- Wideo 10 s i 30 s: record, preview, compression, upload, viewer, cleanup.
- Multi-recipient: wyślij ten sam snap do 1, 3 i 10 odbiorców.
- Background/foreground: rozpocznij upload, zminimalizuj aplikację i wróć.
- Permissions: odmowa Camera, Microphone i Photos, potem ponowne nadanie uprawnień.
- Poor network: przerwij sieć w trakcie uploadu i sprawdź retry oraz komunikat błędu.

## Metryki Do Porównania
- `camera_ready_ms` p50/p95.
- `photo_capture_ms` p50/p95.
- `compression_ms` dla foto i wideo.
- `media_original_bytes` vs `media_compressed_bytes`.
- `upload_ms`, `upload_retry_count`, failed upload rate.
- `viewer_signed_url_ms`, `viewer_prefetch_ms`, `viewer_media_ready_ms`.
- Crash-free rate i memory warnings.

## Kryteria Akceptacji
- 10 s wideo nie powoduje widocznego laga UI ani OOM na iPhone 11/12.
- Wideo po kompresji jest zwykle mniejsze o co najmniej 60%.
- Użytkownik widzi etap kompresji/uploadu.
- Inbox i profile nie pobierają nieograniczonej historii.
- Cleanup snapów działa po obejrzeniu i po retry.
