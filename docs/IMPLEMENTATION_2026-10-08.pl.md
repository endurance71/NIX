# NiX — implementacja planu stabilizacji, 2026-10-08

Zmiany są przygotowane w jedynym checkout `NIX`, na branchu `codex/nix-stabilization`, z punktu wyjścia `884abe1953e0a20db62a31f2bcfef8365763b404`. Nowy kandydat ma wersję **1.0.12**, build **7** i runtime **1.0.12**. Stan produkcji i App Store Connect nie był zmieniany. Kopie usuniętych worktree i wcześniejsze stashe pozostają zachowane zgodnie z [protokołem czyszczenia](NIX_WORKTREE_CLEANUP_2026-10-07.pl.md).

Późniejszy etap z 2026-10-08 zamknął backlog złożoności F22: pełny React Doctor 0.9.17 ma **0 błędów i 0 ostrzeżeń**, a obie bramki działają bez baseline. Wpisy o 24 diagnozach poniżej opisują wcześniejszy stan stabilizacji. Aktualny wynik, 578 testów, buildy i zakres QA zapisano w [raporcie zero ostrzeżeń](REACT_DOCTOR_ZERO_2026-10-08.pl.md).

## Zrealizowane naprawy

| Znaleziska audytu | Implementacja |
| --- | --- |
| F01–F04 | Nowa migracja zamyka bezpośredni INSERT mediów, wiąże materializację z assetem/nadawcą/path/moderacją, zamraża obiekt Storage po uploadzie, ogranicza zaproszenia znajomych do pending i akceptacji przez odbiorcę, odbiera klientowi zapis kolejki cleanup. RPC request/prepare/finish wyliczają kanoniczną ścieżkę i sprawdzają aktywne referencje oraz replay. |
| F05, F09, F23 | Outbox używa uchwyconego JWT, właściciela, generacji sesji i anulowania transportu. Flush jest pojedynczy dla właściciela. Zmiana konta/wylogowanie anuluje stare operacje. Klucze AES są tworzone i usuwane w jednej kolejce; błąd jednego wpisu nie usuwa całego cache. CONTENT_NOT_ALLOWED jest terminalne. |
| F06, F14 | Najpierw terminalizowane są wygasłe zadania moderacji, potem usuwany payload. Rejected/error media trafiają do czyszczenia. Cron działa co 5 minut. Eksport zachowuje storage_path do potwierdzonego usunięcia, ponawia błąd i nie znika przed ACK. |
| F07, F19 | Semantyczna akcja migawki/startu/stopu nagrania dla VoiceOver, akcje regulacji zoomu, wejście do Ustawień po trwałej odmowie i odświeżenie uprawnień po powrocie, teksty PL/EN i język Live Activity. |
| F08 | Zdjęcia są szyfrowane AES-256-GCM w SQLite, z kluczem per konto w Keychain i metadanymi AAD. Downloader iOS używa ephemeral URLSession bez URLCache; viewer renderuje data URI bez cache ExpoImage. TTL przed pierwszym odczytem wynosi 10 minut, po ACK pochodzi z server replay_expires_at. Odczyt nie przedłuża TTL. TTL i uprawnienia online są sprawdzane ponownie po crypto/zapisie, przed zwróceniem obrazu. Cleanup/replay/logout/expiry usuwa wpis, start i foreground wykonują sweep. Globalna kolejka mutacji i limit stron SQLite ograniczają bazę do 480 MiB; pozostałe 20 MiB przeznaczono na dziennik. Usuwanie konta wykonuje pojedyncze, ograniczone wpisy zamiast jednego dużego DELETE. Legacy cache dyskowy jest usuwany jednorazowo. |
| F10–F12 | Uploader zachowuje pause/cancel w callbackach przygotowania, watchdogu i finalizacji. Wszystkie wznowienia respektują trwałe nextRetryAt i attemptId. Identyfikator taska zawiera sesję URLSession. Restarty zachowują retry deadline. |
| F13 | Zdjęcie ma limit 4 MiB w przygotowaniu klienta, Edge, SQL i workerze. Worker liczy rzeczywiste bajty; zły input kończy lease terminalnie zamiast pozostawać processing. |
| F15, F18, F20 | Typy tras są regenerowane przed tsc; naprawiony mock testu analityki. Manifest obejmuje 48 migracji. Walidator dotenv otrzymuje root projektu także z ios/. Docker build korzysta z wstrzykiwanego runnera. CI dodaje Edge/worker oraz izolowane migracje i Auth/Storage dla ścieżek A/B. |
| F16 | Expo 57.0.27 i pakiety z jego macierzy, Supabase 2.117.3 w JS/Edge, poprawki zależności, zip.js 2.23.0 i AppCheckCore 11.3.2. Zachowano kompatybilne wersje RN/Reanimated/Worklets. Patche natywne przeniesiono; stary patch QR usunięto, ponieważ upstream zawiera zmianę. Adapter query-string obsługuje poprawiony dekoder ESM 0.5.0. |
| F17 | Generator odczytuje faktyczny lokalny katalog po migracjach: 31 relacji i 76 RPC. Oba createClient używają Database; modele UI i walidacja pól CHECK są oddzielone od wygenerowanego kontraktu. Generator odmawia zdalnych DSN, kodowanych connection strings w nazwie bazy i dziedziczonych przekierowań libpq. |
| F21, F22 | Kanon wydania odróżnia lokalny kandydat od ostatniej obserwacji ASC z 12 września. Wyodrębniono transport sesji, operacje właściciela/klucze, cache zdjęć, sterowanie uploaderem, limity, cleanup i wspólny ekran dokumentów. Dalszy podział dużych ekranów jest jawnym backlogiem utrzymania. |

Historyczne migracje pozostają niezmienione. Dwie nowe migracje to `20261007120000_harden_media_friendships_and_cleanup.sql` oraz `20261007121000_fix_retention_and_image_limits.sql`. Nowy klient używa wyłącznie durable begin/finalize; stare drogi direct INSERT zostały usunięte. Zmiana backendu może wymagać aktualizacji starszego klienta zgodnie z zaakceptowaną decyzją.

## Weryfikacja

| Sprawdzenie | Wynik lokalny |
| --- | --- |
| Czyste `npm ci` | PASS; wszystkie 7 patchy zastosowane |
| TypeScript, ESLint, Knip | PASS |
| Vitest | 91 zestawów, 503 testy PASS |
| Expo Doctor / macierz Expo | 20/20 PASS / PASS bez wyjątków wersji |
| React Doctor: pełny i changed | PASS z jawnym baseline 24 istniejących diagnoz złożoności |
| Deno Edge: check / test | PASS / 94 testy PASS |
| Worker moderacji | 60 testów PASS, zamrożony deno.lock |
| Node: C3B / release-env / dekoder URI | 71 / 11 / 2 testy PASS |
| Migracje / SQL | 48 migracji; 15 zestawów, 201 asercji PASS — ograniczenia środowiska poniżej |
| Natywna polityka uploadera Swift | 43 sprawdzenia zachowania PASS |
| Eksport produkcyjny Hermes | PASS; 3062 źródła w mapie, bez node-forge/braces/micromatch |
| Cache SQLite, baza + journal | PASS: 504 412 880 B < 524 288 000 B dla 79 wpisów o rozmiarze bliskim 6 MiB |
| Xcode Debug, iOS Simulator | BUILD SUCCEEDED; arm64 + x86_64, bez podpisywania; aplikacja i widget 1.0.12 (7) |

Testy cache zatrzymują szyfrowanie/odszyfrowanie, zmieniają zegar, konto lub stan replay/cleanup i sprawdzają odmowę zwrócenia obrazu. Test dwóch właścicieli sprawdza globalny limit przy równoległych zapisach. Test realnego SQLite używa syntetycznego ciphertextu i mierzy bazę oraz rollback journal przed commit pojedynczego usunięcia; po wyczyszczeniu baza ma 16 KiB. [Wynik pomiaru](audit-evidence/2026-10-08-cache-disk-cap.json) i [wyniki SQL](audit-evidence/2026-10-08-sql-results.json) są zachowane w repozytorium.

Pełny [zapis sprawdzeń](audit-evidence/2026-10-08-stabilization-checks.json) zawiera wersje narzędzi, wyniki, hash mapy Hermes i granice walidacji. Build Xcode skompilował nowe `NativeUploadControl.swift` i `PhotoMemoryDownloader.swift` dla obu architektur. Lokalnie użyto tymczasowego BASH_ENV przywracającego prawidłowy PATH, ponieważ zainstalowany `/usr/local/bin/bash` ma niezgodną architekturę. Po odtworzeniu nagłówków SQLite usunięto stary cache wyłącznie tego modułu z DerivedData. Nie zmieniano globalnej konfiguracji systemu. Tymczasowy PostgreSQL został zatrzymany i usunięty po zachowaniu wyników SQL.

Testy SQL wykonano na izolowanym PostgreSQL 14 z UTF-8 i inertnymi stubami Auth/Storage/cron/net/vault poza schematem aplikacji. To waliduje migracje, uprawnienia i RLS, ale nie zastępuje PostgreSQL 17 oraz prawdziwego Storage/TUS. Lokalne środowisko nie ma działającego Dockera. Nowy workflow `backend-quality.yml` uruchamia pełny stack Auth/Storage A/B, wszystkie SQL suites oraz HTTP z realnym JWT: upload i zmiana pending mają przejść, overwrite po zatwierdzeniu ma zostać odrzucony i bajty mają pozostać niezmienione. Osobny job macOS uruchamia testy polityki Swift. Workflow został przygotowany, ale nie był uruchamiany zdalnie w ramach tej implementacji.

## Zależności i jawne wyjątki

Npm audit zmalał z **42** zgłoszeń (2 critical, 34 high, 6 moderate) do **22 high**, wynikających z dwóch przyczyn: node-forge 1.4.0 oraz braces 3.0.3. Nadal nie mają opublikowanej poprawionej wersji. Ocena dotyczy użycia przez narzędzia budowania, a nie importów aplikacji. Mapa produkcyjnego bundle nie zawiera node-forge/braces/micromatch; zawiera zaktualizowany dekoder URI i adapter query-string.

Zakres, źródła i termin ponownego przeglądu **2026-11-08** zapisano w [dependency-exceptions.json](../security/dependency-exceptions.json). `audit:reviewed` blokuje nowe high/critical, zmianę wersji wyjątku, przekroczenie daty oraz włączenie code-signing bez ponownej oceny. Raw `audit:high` nadal pokazuje i blokuje te 22 zgłoszenia. Nie wykonano `audit fix --force` ani downgrade Expo/RN. Źródła producentów: [forge #1149](https://github.com/digitalbazaar/forge/issues/1149), [braces #70](https://github.com/micromatch/braces/issues/70).

React Doctor 0.9.17 wnosi 24 istniejące ostrzeżenia złożoności funkcji UI. Zapisano je jawnie w baseline; gate blokuje pozostałe i nowe diagnozy. Raw skan nadal pokazuje backlog. Wyjątki sekwencyjnego await opisują zależności właściciela/SQLite/cleanup; nie równoleglimy operacji zmieniających stan konta. Szczegóły: [baseline React Doctor](react-doctor-baseline.md).

Migracje głównych wersji Expo 58, React Native, React, TypeScript, Sentry i pozostałych bibliotek pozostają osobnym zadaniem, zgodnie z decyzją „stabilność najpierw”.

## Warunki rollout

1. Uruchomić nowy workflow Auth/Storage A/B na Dockerze i potwierdzić PostgreSQL 17/TUS/Storage HTTP. Wykonać migracje wyłącznie w przygotowanym staging.
2. Zbudować nowy binary 1.0.12 (7); zweryfikować na fizycznym iPhone VoiceOver, odmowę uprawnień/Settings, pause/retry/relaunch w tle, zmianę konta podczas wysyłki i replay online/TTL/logout.
3. Sprawdzić aktualny stan ASC, flagi i limit dostawcy. Żadne płatne wywołanie Azure nie było częścią tej implementacji.
4. Przy rollout obserwować błędy owner/JWT, wiek kolejki, retry i latency moderacji, zaległy cleanup/eksporty. Rollback zatrzymuje delivery/worker; nie przywraca direct INSERT, nadpisywania Storage ani nie wyłącza ochrony moderacji w celu odblokowania treści.

Odtworzenie zależności: `npm ci`, następnie `pod install` w `ios/` przed bezpośrednią kompilacją Xcode. Czysta instalacja npm usuwa także generowane nagłówki SQLite, które CocoaPods musi odtworzyć. Typy schematu: `NIX_TYPES_DB_URL=<lokalny DSN po migracjach> npm run gen:database`. Node 24.18.0 i Deno 2.9.6 są przypięte. Deno pomija package.json aplikacji i używa osobnego, zamrożonego deno.lock dla Edge/spike.
