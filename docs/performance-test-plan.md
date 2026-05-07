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

## Video pipeline v2 — checklista urządzeniowa

### Resumable (TUS) upload
- [ ] iPhone 11 / iOS Low Power: nagranie 60 s, upload nie powoduje memory warning ani crashu (RAM ≤ 200 MB w peaku).
- [ ] Android mid-range (np. Pixel 4a): nagranie 60 s, brak `OutOfMemoryError`, RAM ≤ 250 MB.
- [ ] Symulacja słabej sieci (Network Link Conditioner — Edge / 100 kbps loss 2%): upload 30 s wideo wznawia się po retry; widać `resumable_upload_retry` w telemetrii.
- [ ] Pause/resume: w trakcie uploadu zminimalizuj aplikację, wróć po 30 s — upload kontynuuje się od miejsca przerwania (Supabase TUS server-side state).
- [ ] Abort: anulowanie wysyłki w 30% progresu generuje `DomainError('CANCELLED')` i nie pozostawia osieroconych obiektów w buckecie (sprawdzić w Supabase Storage UI).
- [ ] Plik > 100 MB: walidacja po stronie klienta rzuca komunikat „Plik wideo jest za duży. Maksymalny rozmiar to 100 MB.” bez próby wysyłki.

### Embedded thumbnail
- [ ] Time To First Pixel u odbiorcy: po stuknięciu w snap wideo pierwsza klatka pojawia się < 200 ms (przed pobraniem signed URL).
- [ ] Viewer wyświetla `viewer_thumbnail_source: 'embedded'` w telemetrii dla nowych snapów.
- [ ] Snapy stworzone przed migracją (`thumbnail_b64 = NULL`) — viewer pokazuje czarny placeholder do momentu `onReady` z `expo-video`, telemetria `viewer_thumbnail_source: 'missing'`.
- [ ] Twardy limit `octet_length(thumbnail_b64) <= 60000` egzekwowany przez DB (próba ręcznego wstawienia większej miniatury → błąd CHECK).
- [ ] Telemetria `thumbnail_b64_size_bytes` w typowym przypadku 8–35 KB (median), `thumbnail_b64_skipped` < 1% wysyłek wideo.

### Fast-path kompresji
- [ ] Nagranie 5 s (~3 MB) — `compression_skipped` wyemitowane, `compression_ms` ≤ 50 ms.
- [ ] Nagranie 30 s (~15 MB) — `compression_skipped` NIE wyemitowane, `compression_ms` < 4 s na iPhone 11.

### Backward compatibility
- [ ] Środowisko dev bez wykonanej migracji `thumbnail_b64`: `insertSnap` retry-uje bez kolumny i kończy się sukcesem.
- [ ] Środowisko z migracją: typowy snap wideo ma `thumbnail_b64` zapisany (verify w Supabase SQL Editor).

## Preview wideo po nagraniu (sesja audio + race conditions)

Cel: potwierdzić, że odtwarzacz `expo-video` w `src/app/preview.tsx` startuje deterministycznie po nagraniu i odtwarza dźwięk niezależnie od pozycji silent switcha.

### Audio session (expo-audio)
- [ ] Cold start aplikacji → telemetria `audio_session_set { mode: 'playback', status: 'success' }` przed pierwszym wejściem do preview.
- [ ] Po pierwszym `recordAsync()` w sesji: telemetria `audio_session_set { mode: 'recording' }`, a następnie po zakończeniu nagrania `audio_session_set { mode: 'playback' }` przed pushem na `/preview`.
- [ ] Idempotencja: kolejne wejścia do `/preview` lub `/viewer` w tej samej sesji NIE generują dodatkowych eventów `audio_session_set` (cache trybu).

### Silent switch
- [ ] Silent switch ON, nagrać wideo, otworzyć preview — dźwięk odtwarzany (kategoria `playback` + `playsInSilentMode: true`).
- [ ] Silent switch OFF — dźwięk odtwarzany jak wyżej.
- [ ] Tuż po wejściu do `/viewer` z inbox (wideo) silent switch ON — dźwięk odtwarzany.

### Multi-segment preview (5 segmentów)
- [ ] Nagrać 5 segmentów (po 5–10 s każdy), wejść w preview — każdy segment startuje samodzielnie, brak nieskończonego loadera.
- [ ] Każdy segment ma dźwięk od pierwszej klatki (brak „raz jest, raz nie ma”).
- [ ] Przewijanie między segmentami (tap) działa płynnie, brak utknięć na „Ładowanie podglądu…”.
- [ ] Brak eventów `preview_video_stuck_watchdog` w telemetrii (lub <1% segmentów).

### Sekwencja nagrań w jednej sesji
- [ ] Cold start → nagranie #1 → preview (dźwięk OK) → wstecz → nagranie #2 → preview (dźwięk OK) → wstecz → nagranie #3 → preview (dźwięk OK).
- [ ] Po każdym powrocie z preview kamera startuje normalnie i kolejne `recordAsync()` ma dźwięk (mikrofon dostępny).

### Watchdog
- [ ] Wymuszone testowo (np. via mock w dev) opóźnienie `readyToPlay` > 2.5 s → emituje `preview_video_stuck_watchdog` z `current_status` i loader znika (player próbuje wystartować mimo braku eventu).
- [ ] Telemetria `preview_video_status_change { status: 'readyToPlay', segment_index }` pojawia się raz na segment.

### Viewer (analogicznie)
- [ ] Otwarcie wideo z inboxa po cold start → odtwarzanie z dźwiękiem, brak `viewer_video_stuck_watchdog`.
- [ ] Po obejrzeniu kilku snapów wideo z rzędu — brak żadnych „milczących” snapów ani utknięć na thumbnailu.
