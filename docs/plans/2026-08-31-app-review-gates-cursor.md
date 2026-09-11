# NiX — plan zamknięcia bramek App Review dla Cursora

> Stan audytu: 2026-08-31. Werdykt: **NO-GO**. Build `1.0.11 (5)` pozostaje
> wyłącznie kandydatem Internal TestFlight. Najwcześniejszy kandydat publiczny to
> `1.0.11 (6)` lub wyższy, zbudowany z oznaczonego SHA `main` po zamknięciu P0.

## Zasady wykonania

- Pracuj seryjnie, jeden problem i jeden PR naraz; każdy PR bazuje na aktualnym
  `main`.
- Nie modyfikuj ani nie naprawiaj historycznych gałęzi i builda 5.
- Nie wykonuj deployu, migracji produkcyjnej, Xcode Archive, uploadu ani App
  Review submission bez osobnej jawnej autoryzacji.
- Nie dodawaj sekretów, fixture'ów z prawdziwą treścią użytkowników ani danych
  kont demo do Git.
- Każdy etap kończy się aktualizacją `docs/release/ios-current.md` i dołączeniem
  dowodów operacyjnych przechowywanych poza repozytorium.
- W razie błędu moderacji obowiązuje fail-closed. Nie wolno dostarczyć treści ani
  wysłać push przed `approved`.

## PR C1 — least privilege i produkcyjne security gates

Cel: zamknąć nowe ostrzeżenia bezpieczeństwa Supabase przed zmianami P0-3.

1. Dodać migrację z jawną listą uprawnień funkcji:
   - odebrać `PUBLIC` i `anon` możliwość `EXECUTE` na wszystkich funkcjach
     `SECURITY DEFINER`, chyba że istnieje udokumentowany, przetestowany powód;
   - bezwarunkowo odebrać bezpośrednie `EXECUTE` na triggerze
     `enqueue_push_notification_job()` dla `PUBLIC`, `anon` i `authenticated`;
   - dla RPC używanych przez aplikację przyznać tylko `authenticated` i
     zachować kontrolę `auth.uid()` oraz walidację właściciela;
   - funkcje administracyjne i workery udostępnić wyłącznie `service_role`;
   - nie odbierać hurtowo dostępu `authenticated` bez mapy wywołań klienta.
2. Dodać pgTAP/SQL contract test z allowlistą ról dla każdej funkcji
   `SECURITY DEFINER`. Test ma wykrywać domyślne granty po kolejnych migracjach.
3. Rozszerzyć bramkę CI o aktualne reguły Supabase Advisors lub równoważne
   zapytanie katalogowe. Nie uznawać lokalnego `supabase db lint` za jedyny
   dowód — produkcja obecnie raportuje 55 ostrzeżeń security.
4. Ustawić brak `SUPABASE_DB_URL` jako błąd dla produkcyjnych skryptów
   `check:media-storage-integrity` i `check:moderation-evidence-integrity`.
   Jeśli potrzebny jest tryb deweloperski, dodać osobny jawny skrypt `*:local`.
5. Po autoryzowanym deployu uruchomić smoke: logowanie, profile, zaproszenia,
   inbox, wysłanie tekstu, upload mediów, push, report, block i data export.

Kryteria akceptacji:

- zero nieuzasadnionych `anon_security_definer_function_executable`;
- każda funkcja ma jawny kontrakt ról;
- aplikacja zachowuje wszystkie główne przepływy;
- production Advisors nie mają ostrzeżeń P0 związanych z anonimowym dostępem.

## PR C2 — P0-3 walidacja dostawcy

Cel: domknąć PR #9 bez wdrażania enforcementu.

1. Zrebase'ować PR #9 na aktualny `main` i utrzymać zakres: ADR, polityka,
   fixture'y syntetyczne/licencjonowane oraz spike.
2. Utworzyć Azure Content Safety F0 w `Sweden Central` poza Git.
3. Uruchomić macierz PL/EN: tekst bezpieczny/niedozwolony, Unicode, odstępy,
   prosta obfuskacja, JPEG oraz MP4 15/60/180 s.
4. Dla wideo porównać 1 fps (maks. 180 klatek) z 12/24/60 próbkami, scene
   anchors i contact sheets. Zmierzyć recall, false positives, p95 i liczbę
   transakcji.
5. Potwierdzić rezydencję danych i budżet do 5000 transakcji F0.
6. Ustawić ADR na `Accepted` wyłącznie po spełnieniu wszystkich kryteriów.

Warunek STOP: jeśli jakość, rezydencja albo koszt nie przechodzą, pozostawić
ADR jako `Rejected`/`Proposed`, status wydania `NO-GO` i nie rozpoczynać C3.

## PR C3 — P0-3 enforcement i backendowe wysyłanie tekstu

Cel: spełnić Guideline 1.2 przez filtrowanie przed opublikowaniem treści.

1. Dodać kwarantannę oraz stany `moderation_pending`, `approved`, `rejected`,
   `error` dla assetu i zadania moderacji.
2. Zmienić `finalize-media-upload`, aby:
   - zwracał `moderation_pending`;
   - nie tworzył NiXów ani pushy przed `approved`;
   - skanował logiczny asset dokładnie raz, niezależnie od liczby odbiorców;
   - przy reject/error nie tworzył wiadomości i nie działał fail-open.
3. Dodać Edge Function `send-text-message`; odebrać klientowi bezpośredni insert
   do `text_messages`. Obecny filtr CHECK pozostawić jako defense in depth.
4. Zaimplementować stabilne kody klienta: `MODERATION_PENDING`,
   `CONTENT_NOT_ALLOWED` oraz retryable technical error.
5. Worker: idempotencja, lease/heartbeat, retry z backoffem, dead-letter/error,
   TTL kwarantanny, cleanup i brak treści użytkowników w logach.
6. Severity 4 mapować na `rejected`; `review_required` pozostawić wyłączone do
   czasu wskazania właściciela i SLA.
7. Dodać testy: retry, duplikat, callback poza kolejnością, wielu odbiorców,
   brak sekretu, timeout, 429, 5xx, provider-down i próba odczytu kwarantanny.
8. Rollout tylko po autoryzacji: expand -> worker off -> konto testowe ->
   enforcement -> obserwacja -> contract.

Kryteria akceptacji:

- zero doręczeń i pushy bez `approved`;
- reject/error nie tworzy wiadomości;
- kwarantanna jest niedostępna dla klienta;
- retry nie tworzy duplikatów;
- testy migracji expand i contract przechodzą niezależnie.

## PR C4 — operacje moderacji i SLA Apple 1.2

Cel: zapewnić terminowe reakcje i dowód operacyjny.

1. Rozliczyć istniejący raport starszy niż 24 godziny bez umieszczania treści
   użytkownika w Git.
2. Zdefiniować właściciela, godziny obsługi i SLA według priorytetu; osobna
   ścieżka dla przemocy, self-harm, child safety i powtarzalnych naruszeń.
3. Dodać monitor liczby raportów po SLA, alert oraz runbook eskalacji.
4. Udowodnić report -> review -> remove/dismiss -> appeal -> audit log.
5. Zweryfikować, że usunięcie treści działa dla tekstu, zdjęcia i wideo oraz że
   powiązane dowody zachowują właściwą retencję.

Kryteria akceptacji: brak nierozwiązanych raportów po SLA, działający alert i
zapisany smoke bez danych użytkowników.

## PR C5 — push JWT i brak push przed akceptacją

1. Zachować Vault-backed nagłówki cronów i testy helpera.
2. W autoryzowanym deployu wydać `push-dispatch` z `verify_jwt=true`.
3. Potwierdzić HTTP 200 z cronów `push-dispatch` i `push-receipts`.
4. Dodać kontrakt, że `moderation_pending`, `rejected` i `error` nigdy nie
   generują push jobów.
5. Przy regresji wykonać rollback i utrzymać `NO-GO`.

## PR C6 — zależności natywne i deterministyczny toolchain

1. Zaktualizować React Native `0.86.2` do kompatybilnego wydania zawierającego
   poprawione Metro/`image-size`; nie używać `npm audit fix --force`.
2. Ustawić Node 24 w środowisku lokalnym i CI zgodnie z `package.json`.
3. Przypiąć wersję Deno i odświeżyć `deno.lock` dokładnie tym toolchainem.
4. Wymagać `npm audit --audit-level=high` bez nierozliczonych podatności high.
5. Po zmianach wykonać pod install/prebuild diff, pełne testy i lokalny Archive.

Kryteria akceptacji: zero podatności high, brak samoczynnego diffu lockfile,
Expo Doctor 20/20 i nowa binarka uruchamia się na urządzeniu.

## PR C7 — metadata, privacy i review package

1. Uaktualnić opis dopiero po faktycznym włączeniu moderacji; usunąć zdania, że
   zdjęcia i wideo nie są skanowane.
2. Potwierdzić w App Store Connect:
   - Privacy Policy URL, App Privacy i privacy choices;
   - rating zgodny z messaging/UGC i wewnętrznym progiem 16+;
   - kategorię Social Networking, eksport compliance i content rights;
   - dwa nieekspirujące konta demo będące znajomymi;
   - kontakt z numerem telefonu w formacie międzynarodowym;
   - komplet screenshotów z fikcyjnymi danymi i dokładne Review Notes.
3. Zweryfikować publiczne `/privacy`, `/terms` i `/support` z typowym User-Agent,
   bez logowania i bez agresywnego rate limitu dla reviewera.
4. Upewnić się, że deklaracja diagnostyki odpowiada finalnemu buildowi. Nie
   włączać Sentry DSN bez aktualizacji App Privacy i polityki.
5. Opisać `expo-updates`: wyłącznie poprawki zgodne z zatwierdzoną funkcją, bez
   obchodzenia App Review przez znaczące zmiany funkcjonalne.

## C8 — test urządzeniowy i kandydat `1.0.11 (6+)`

Po scaleniu C1-C7 i autoryzowanych deployach:

1. Uruchomić pełny smoke na fizycznym iPhonie oraz test kompatybilności iPada:
   Apple/email login, usunięcie konta i revoke, allow/reject/provider-down,
   report/block/removal, wklejanie obrazu, background upload, offline/retry,
   clean install, upgrade oraz brak zgody na push/kamerę/mikrofon/zdjęcia.
2. Przetestować IPv6/NAT64 i słabą sieć.
3. Potwierdzić w produkcji zero: doręczeń bez `approved`, pushy pending/rejected,
   osieroconych plików po TTL i permanentnie zakleszczonych zadań.
4. Utworzyć podpisany tag źródła, wykonać lokalny Xcode Archive i wysłać build
   `6+` dopiero po osobnej autoryzacji.
5. Wybrać dokładnie przetestowany build w ASC. Dopiero po PASS wszystkich
   bramek zmienić status na `READY FOR REVIEW`, następnie wysłać i potwierdzić
   `WAITING FOR REVIEW`.

## Obowiązkowa bramka końcowa

- lint, typecheck, 430+ Vitest, Knip: PASS;
- React Doctor full i changed: 100/100;
- Expo Doctor i install check: PASS;
- Deno check/test oraz wszystkie pgTAP: PASS;
- production DB lint, Advisors i integralność storage/evidence: PASS;
- `npm audit --audit-level=high`: PASS;
- publiczne URL-e, ASC metadata, App Privacy, rating i demo accounts: PASS;
- pełny smoke urządzeniowy oraz obserwacja produkcji: PASS;
- status pozostaje **NO-GO**, jeśli choć jedna bramka P0 nie ma dowodu.
