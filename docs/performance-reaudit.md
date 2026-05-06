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
- Supabase Storage SDK nadal przyjmuje body jako `Uint8Array`; dla dużych plików kolejnym krokiem jest pełny natywny/resumable upload.
- Thumbnail wideo jest generowany lokalnie, ale nie jest jeszcze utrwalony jako osobny obiekt i pole w tabeli `snaps`.
- Background upload wymaga dodatkowej decyzji produktowej oraz testów iOS background modes.
- Paginowane RPC są dodane do SQL setup, ale UI używa obecnie limitów i może wymagać pełnego infinite scroll w kolejnej iteracji.
