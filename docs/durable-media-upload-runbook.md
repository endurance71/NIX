# Trwała wysyłka mediów i Live Activity — runbook

## Zakres

Nowy pipeline zapisuje zadanie i odbiorców w SQLite (WAL), kopiuje źródło do
`Application Support/NiX/Uploads/<jobId>`, przygotowuje jeden asset na segment,
wysyła go przez natywną sesję `URLSession` i finalizuje wszystkie NiX-y
atomowo po stronie Supabase.

Ręczne force quit zatrzymuje transfer zgodnie z zachowaniem iOS. Zadanie i
pliki pozostają trwałe przez maksymalnie siedem dni i są uzgadniane przy
następnym uruchomieniu aplikacji.

## Kolejność wdrożenia

1. Zastosuj migracje:
   - `20260728120000_durable_shared_media_uploads.sql`
   - `20260728121000_schedule_media_upload_orphan_cleanup.sql`
   - `20260728122000_fix_capture_attempt_idempotency.sql`
2. Wdróż funkcje:
   - `begin-media-upload`
   - `finalize-media-upload`
   - `cancel-media-upload`
   - `cleanup-media-upload-orphans`
   - zmienione `cleanup-nix`, `cleanup-nix-due` i `block-user`
3. Potwierdź, że cron `cleanup-media-upload-orphans` jest aktywny i że
   `private.push_edge_auth_headers()` zwraca nagłówek service-role.
4. W Apple Developer włącz App Group
   `group.com.damianmotylinski.nixapp.uploads` dla aplikacji oraz rozszerzenia
   `com.damianmotylinski.nixapp.UploadStatusWidget`.
5. Zbuduj nowy binary lokalnie (Ścieżka B: Xcode Archive → TestFlight) —
   patrz [`DEPLOY_IOS_TESTFLIGHT.md`](./DEPLOY_IOS_TESTFLIGHT.md). SQLite,
   background URLSession, App Group, widget extension i Live Activities nie
   mogą zostać dostarczone samą aktualizacją OTA. Nie używaj `eas build`.
6. Najpierw Smoke Release na fizycznym iPhonie, potem Archive → ASC.
7. Dopiero po walidacji urządzeń włącz produkcyjny rollout. HEVC pozostaje
   wyłączony.

## Flagi awaryjne OTA

- `EXPO_PUBLIC_BACKGROUND_UPLOAD_ENABLED=false` — wyłącza rozpoczynanie
  nowych natywnych transferów i używa transportu zgodności.
- `EXPO_PUBLIC_UPLOAD_LIVE_ACTIVITY_ENABLED=false` — nie rozpoczyna nowych
  Live Activities.
- `EXPO_PUBLIC_HEVC_CAPTURE_ENABLED=false` — wymusza produkcyjny profil H.264.

Migracji nie cofamy podczas wyłączania flag. Funkcje i kolumny są zgodne
wstecznie, a istniejące zadania pozostają w kolejce.

## Kontrakty i prywatność

- Begin/finalize/cancel są idempotentne.
- Finalizator przyjmuje jednorazową, deterministyczną capability ograniczoną
  do batcha; nie przechowuje sesji użytkownika w zadaniu natywnym.
- Finalizator sprawdza istnienie obiektu, dokładny rozmiar i MIME.
- Odbiorca może pobrać współdzielony asset wyłącznie przy aktywnym NiX-ie.
- Cleanup, retry cleanupu i blokowanie użytkownika usuwają obiekt dopiero po
  zniknięciu ostatniej aktywnej referencji.
- Live Activity zawiera tylko fazę, procent, liczbę pozostałych zadań i czas
  aktualizacji. Nie zawiera odbiorców, nazw, ścieżek ani miniatur.

## Profile kompresji

- Zdjęcie: JPEG, dłuższy bok do 1440 px, jakość 0,75. Oryginał pozostaje,
  jeśli oszczędność jest mniejsza niż 10%.
- Wideo zbalansowane: H.264 do 1280×720, 1,8 Mb/s, AAC 96 kb/s.
- Passthrough: tylko plik do 100 MB o bitrate nieprzekraczającym celu.
- Recovery 413: jeden nowy idempotentny batch i profil 960 px / 0,9 Mb/s.
  Drugie 413 jest błędem trwałym.
- HEVC 1,2 Mb/s pozostaje za flagą i nie jest włączane w pierwszym wydaniu.

## Macierz akceptacyjna

Na fizycznych urządzeniach sprawdź:

- zdjęcie kończące się szybko (Live Activity rozpoczyna się od razu i kończy stanem sukcesu);
- długi film przy zablokowanym ekranie;
- Wi‑Fi → offline → LTE i LTE → Wi‑Fi;
- zamknięcie ekranu wyboru odbiorców bez utraty zadania;
- restart procesu, restart telefonu oraz force quit i ponowne uruchomienie;
- wygasły URL, 401/403, 409, 413 i 5xx;
- pauzę/anulowanie podczas kompresji oraz podczas transferu;
- ten sam asset dla co najmniej trzech odbiorców i cleanup każdego w innej
  kolejności;
- blokowanie jednej osoby bez usunięcia pliku pozostałym;
- raport moderacyjny przed cleanupem;
- iPhone z Dynamic Island, iPhone bez Dynamic Island oraz wyłączone Live
  Activities;
- deep link `nix://inbox`.

Przed wydaniem uruchom:

```sh
npm run typecheck
npm test -- --run
npm run deno:check
npm run deno:test
npm run check:supabase-migrations
npm run check:supabase-db-lint
npm run check:ios-config
npm run export:production
```

`check:supabase-db-lint` wymaga uruchomionego lokalnego Supabase/Postgresa.

## Obserwowalność

Mierz rozmiar wejścia/wyjścia, czas kompresji, kodek/profil, retry oraz czas
end-to-end. Nie wysyłaj do telemetrii lokalnych ścieżek, tokenów finalizacji,
nazw ani identyfikatorów odbiorców. Alertuj co najmniej na wzrost:

- `FILE_TOO_LARGE_PERMANENT`;
- orphanów starszych niż 24 godziny;
- batchy w `finalizing`/`pending` poza oczekiwanym oknem;
- błędów finalizacji 409;
- zadań lokalnych dochodzących do siedmiu dni retencji.
