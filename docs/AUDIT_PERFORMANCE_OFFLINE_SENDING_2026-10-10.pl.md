# NiX: audyt wydajności, offline, informowania i UI wysyłki (2026-10-10)

Gałąź: `fix/pre-review-hardening` (kandydat build 11, runtime 1.0.12). Audyt był **tylko do odczytu**: nie zmieniono kodu, nic nie zbudowano ani nie opublikowano.

Oznaczenia:
- **[H]** — hipoteza, którą trzeba sprawdzić na urządzeniu. Wszystko bez tego oznaczenia zostało sprawdzone w kodzie. Najważniejsze punkty sprawdziłem drugi raz ręcznie.
- **P0** — każdy użytkownik widzi błąd w podstawowym przepływie albo znacząco traci szybkość.
- **P1** — poważny problem UX lub wydajności.
- **P2** — niespójność, koszt albo drobiazg.
- **OTA** — sama zmiana JS (ścieżka A). **Xcode** — zmiana natywna (ścieżka B). **Backend** — nowa migracja, edge function albo worker.

**Status wdrożenia (2026-10-10, gałąź `fix/app-cleanup-stage1`, bez commita):** etap 1 z sekcji 8 jest zrobiony w JS. Przechodzą lint, typecheck, 619 testów, Knip, React Doctor (0 uwag dla zmian) i `check:text-outbox-security`. Nie zrobiono jeszcze testu na urządzeniu. Wdrożone punkty:
- NOTIF-1, NOTIF-2, NOTIF-3, NOTIF-5, NOTIF-7, NOTIF-8, NOTIF-10;
- SEND-1, SEND-5, SEND-6, SEND-7, SEND-9, SEND-10, SEND-12, SEND-13, część SEND-3 (faza „Sprawdzanie…”);
- OFF-1, OFF-2, OFF-3, OFF-5, OFF-6 (invalidacja), OFF-8;
- PERF-8 (część JS), PERF-9 (b), PERF-11, PERF-13;
- DB-1, DB-2 (JS), DB-3, DB-4.

**Etap 2 (refaktory JS)** jest zrobiony w tej samej gałęzi, też bez commita. Przechodzą lint, typecheck, 715 testów, Knip, React Doctor (0 uwag), `check:text-outbox-security`, `check:sentry-disabled` i `test:release-env`. Zmiany:
- wspólny moduł łączności `src/lib/connectivity.ts` z 2 s histerezą;
- PERF-1, PERF-2, PERF-3, OFF-9 i OFF-12;
- postęp wysyłki rosnący w obrębie jednej próby (SEND-3), sprzątanie zakończonych zadań, SEND-11, SEND-14 i PERF-22;
- czat: PERF-10, PERF-14, SEND-8, OFF-4, OFF-7, OFF-10 i NOTIF-11;
- viewer: PERF-19, PERF-20, PERF-21 i PERF-24;
- banery i push: szybka karta (morph z wyspy tylko dla `prominent`), haptyka w chwili akcji, wywłaszczanie przez błąd, aktualizacja po `id`, NOTIF-6 (częściowo), NOTIF-11 i NOTIF-12;
- bundle JS: z 6,38 MB do 4,94 MB (Sentry i css-tree wycięte, gdy Sentry jest wyłączony; Skia ładowana leniwie).

**Etap 3 (backend)** jest przygotowany, ale nic nie zostało wdrożone. Siedem nowych migracji jest zarejestrowanych w `check-supabase-migrations`:

| Migracja | Zakres |
|---|---|
| `20261011100000_rls_initplan_wrap` | DB-9: 34 polityki z `(select auth.uid())`, RPC profili i znajomych |
| `20261011101000_fk_and_query_indexes` | DB-10: indeksy FK i indeksy pod zapytania aplikacji, usunięcie 6 zbędnych indeksów |
| `20261011110000_moderation_claim_text_priority` | DB-8: tekst przed mediami w `claim_moderation_jobs` |
| `20261011111000_push_pipeline_efficiency` | DB-12: crony `push-dispatch`, `push-receipts` i `cleanup-nix-due` wołają Edge tylko wtedy, gdy jest praca |
| `20261011120000_realtime_private_broadcast` | DB-2: reakcje i usunięcia wiadomości przez prywatny broadcast `user:<id>` |
| `20261011130000_inbox_threads_rpc` | DB-6: `get_inbox_bundle`, czyli 1 zapytanie zamiast 6 |
| `20261011140000_media_client_created_at` | SEND-8: czas utworzenia NiX-a od klienta, przycięty do 15 min |

Zmiany w kodzie poza migracjami:
- worker moderacji: brak uśpienia, gdy jest praca;
- `push-dispatch`: odczyty równolegle, tytuł to nadawca, `ttl` 1 h;
- `begin-media-upload`: bez zapytania do GoTrue, z `client_created_at`;
- klient: prywatny kanał realtime, RPC skrzynki z powrotem do starych zapytań, gdy RPC brakuje, `clientCreatedAt` w żądaniu, limit 20 w kolejce viewera.

Weryfikacja: 22 pliki pgTAP przechodzą lokalnie. Pięć z nich wymaga `pre_delivery_moderation_enabled = false`, bo lokalna baza ma tę flagę włączoną od 2026-09-04. Przechodzą też `deno:check`, `deno:test` (107), worker (71), vitest (737), lint, typecheck, Knip i React Doctor.

**Kolejność wdrożenia (decyzja właściciela; przed wdrożeniem sprawdzić `docs/release/ios-current.md`):**
1. Migracje 100000–140000. Wszystkie są zgodne wstecz z obecnymi buildami. Przy 140000 PostgREST przez chwilę może nie znaleźć funkcji `begin_media_upload_batch` (zmiana sygnatury, DROP + CREATE); klient ponawia. Migracje wdrażać poza szczytem, bo zmiany polityk i budowa indeksów chwilowo blokują tabele.
2. Funkcje Edge `push-dispatch` i `begin-media-upload`. `begin-media-upload` musi zachować `verify_jwt = true`, bo czyta `sub` z JWT zweryfikowanego przez bramkę.
3. Nowy obraz workera moderacji (OVH) z `workers/moderation`.
4. Klient z etapów 1–3 (build albo OTA). Gdy brakuje RPC albo broadcastu, klient działa w trybie zastępczym.
5. Po wdrożeniu: Performance Advisor (`auth_rls_initplan`, `unindexed_foreign_keys`, `duplicate_index`) i aktualizacja dokumentów `docs/push-notifications.md`, `docs/moderation-runbook.md` oraz `docs/NOTIFICATIONS_2026-10-08.pl.md`.

**Etap 4 (zmiany natywne i pozostałe)** jest zrobiony, bez commita. Build Debug na symulator przechodzi (`BUILD SUCCEEDED`, bez ostrzeżeń w zmienionych plikach). Na iPhone 18 Pro / iOS 27 sprawdziłem start aplikacji, ekran logowania, nawigację, fokus pola z klawiaturą i dotyk przy nowym oknie banerów. Nie testowałem po zalogowaniu. Zmiany:
- **SEND-2 i PERF-8 (Swift):** jeden zapisujący Live Activity (JS na pierwszym planie, Swift w tle), te same pasma postępu, zdarzenia URLSession ograniczone do ~4/s, snapshoty w pamięci.
- **PERF-23:** eksport nakładek od razu w profilu wysyłkowym (H.264, 1280 px, 1,8 Mb/s, AAC 96 kb/s), z anulowaniem; `send-to` używa `videoTarget: 'delivery'`.
- **NOTIF-6:** patch `patches/react-native-screens+4.26.2.patch` umieszcza banery we własnym `UIWindow` nad arkuszami, z przepuszczaniem dotyku.
- **PERF-28:** widget w Release bez `-Onone`. Uwaga: `expo prebuild --clean` przywróci tę flagę przez plugin `expo-widgets`.
- **PERF-26:** klawiatura w czacie przez `translateY`, `contentInset` i `scrollTo` na wątku UI.
- **Inne poprawki:**
  - PERF-16: inbox ma `memo(MessageRow)`;
  - PERF-12: zoom kamery jest odizolowany od reszty ekranu;
  - PERF-6: akcent wczytywany przed zdjęciem splasha;
  - migracja `20261011150000_chat_nixes_rpc` z RPC czatu (851 → 20 buforów);
  - PERF-18 i DB-13: awatary zmniejszane do 384 px, z `cacheControl` na 1 rok;
  - NOTIF-14: nieznany stan ustawień powiadomień nie udaje już domyślnego;
  - NOTIF-17: jeden alert o braku uprawnień;
  - zaktualizowane dokumenty push, moderacji, banerów i uploadu.
- **Znalezione podczas smoke testu:** logowanie przez Apple po zamknięciu systemowego promptu pokazywało surowe „RequestUnknownException … .swift:61”. Teraz pokazuje zlokalizowany komunikat.

**Runda 5 (domknięcie i przegląd kodu)** jest zrobiona, bez commita. Przechodzą lint, typecheck, 815 testów, Knip i React Doctor (0 uwag). Zmiany:
- czcionka `ui-rounded` (PERF-7);
- zachowanie tożsamości wierszy skrzynki;
- wspólny cache podpisanych URL-i awatarów per ścieżka (PERF-17, SEND-6);
- patch `expo-widgets`: filtr aktywnych Live Activity, `-O` dla Release w pluginie;
- błędy znajomych jako zlokalizowane kody `DomainError`, bez surowych komunikatów w telemetrii;
- profil rozmówcy od razu z paczki skrzynki (DB-7);
- lokalne wygasanie wiadomości w czacie i podglądach skrzynki (DB-2);
- przygotowanie mediów offline i kontynuacja wysyłki w zadaniu w tle (OFF-11);
- komunikat błędu QR bez surowego tekstu.

Przegląd kodu całego diffu znalazł 7 problemów. Wszystkie są naprawione:
- odpytywanie o moderację z rosnącymi odstępami (5/15/30/60 s) zamiast bez końca;
- skrzynka przechodzi na osobne zapytania przy błędzie RPC;
- powrót do RPC po 10 min zamiast blokady do restartu aplikacji;
- awaryjna subskrypcja reakcji, gdy prywatny kanał nie działa;
- wygasanie przygotowanego z wyprzedzeniem odtwarzacza wideo;
- jedna haptyka na wysyłkę;
- wspólne `sleep` i `useDeadlineClock`.

Nadal otwarte:
- **React Compiler:** włączenie zostało zablokowane przez ochronę uprawnień. Wymaga decyzji właściciela i QA na urządzeniu. Kompilator pomija 17 funkcji (`try/catch` i `try/finally` w hookach), co jest bezpieczne, bo te funkcje po prostu zostają nieskompilowane.
- **`inlineRequires` w Metro:** nie jest włączone. Wcześniej trzeba przenieść rejestracje z efektami ubocznymi (`TaskManager.defineTask`, handler powiadomień, init i18n) do importów wykonywanych przy starcie. Zysk to szacunkowo kilkadziesiąt ms.
- **Zdjęcia odszyfrowywane natywnie (PERF-25):** osobny projekt.
- **Grupowanie pushy w wątki:** wymaga Notification Service Extension.
- **Usunięcie `message_reactions` i DELETE na `text_messages` z publikacji realtime:** dopiero gdy stare buildy wygasną. `docs/NOTIFICATIONS_2026-10-08.pl.md` trzeba zaktualizować, bo opisuje stary timeline banerów.

---

## 0. Najkrótsze podsumowanie

### Dlaczego aplikacja jest wolniejsza, niż mogłaby

1. **React Compiler jest wyłączony, a ręcznej memoizacji nie ma.** W lipcu usunięto `useMemo` i `memo`, bo działał kompilator. Commit `03a4e3d` („Release NiX 1.0.10”, 2026-08-20) wyłączył kompilator (`app.json` → `"reactCompiler": false`) i nie podał powodu. Expo SDK 57 nie memoizuje niczego automatycznie, a w bundlu nie ma żadnego skompilowanego komponentu. Nawet po włączeniu kompilator pominąłby czat, upload, viewer i kamerę (szczegóły w PERF-9). Skutek: inbox, czat i kamera przeliczają wszystko przy każdym renderze. React Doctor pokazuje 0/0, ale nie wykrywa tego problemu.
2. **Postęp uploadu przerenderowuje całą aplikację.** Każdy chunk z natywnego URLSession robi to samo: zapis do SQLite, SELECT wszystkich zadań z odszyfrowaniem każdego wiersza, `setJobs`, nowa wartość kontekstu (bez `useMemo`), a potem render inboxu, czatu i send-to.
3. **Splash czeka na sieć.** Przy dostępnej sieci start czeka na profil i weryfikację wieku, mimo że jest poprawny snapshot. Do tego dochodzi pełna, sekwencyjna hydracja zaszyfrowanego cache offline.
4. **Burze zapytań.** Przy starcie i powrocie z tła `syncForeground` wykonuje się 2–3 razy, a `cancelRefetch: true` przerywa trwające fetche. Paczka inboxu ma 6 zapytań i jest pobierana kilka razy. Do tego realtime na `message_reactions` działa **bez filtra**.
5. **Każde zapytanie Supabase czyta sesję z Keychaina** (manifest i N chunków) pod globalnym `processLock`.
6. **Viewer zdjęcia** wykonuje 5–6 szeregowych zapytań, zanim pokaże pierwszy piksel.
7. **Pole tekstowe w czacie jest zablokowane**, dopóki moderacja tekstu nie zatwierdzi wiadomości. To może trwać do 30 s.

### Dlaczego offline „ma problemy”

1. Zimny start offline z wygasłym tokenem pokazuje splash przez **około 25 s**. Potwierdził to probe na prawdziwym `GoTrueClient`.
2. Wiadomość tekstowa może po powrocie sieci **wisieć do 15 min**. Backoff nie jest resetowany, a dla stanu `pending` nie ma przycisku ponowienia.
3. Wiadomości w outboxie **znikają bez śladu po 24 h**.
4. Upload, który już dotarł na serwer, jest oznaczany jako `failed`, gdy podczas moderacji zniknie sieć albo minie 30 s.
5. Pięć niezależnych listenerów NetInfo działa według różnych reguł. Nie ma debounce, a sprawdzanie dostępności idzie do Google, nie do Supabase.

### Dlaczego informowanie jest słabe

1. `notifyDomainError` w około 30 miejscach pokazuje „Wystąpił nieoczekiwany błąd.” zamiast konkretnego komunikatu.
2. Brakuje 13 kluczy i18n. Po akceptacji zaproszenia użytkownik widzi dosłownie `friends.acceptSuccess`.
3. Do użytkownika trafiają surowe `err.message`, np. „Network request failed” albo „duplicate key…”.
4. Animacja banera trwa około 2,7 s, a haptyka przychodzi około 1,3 s po akcji. Kolejka FIFO potrafi wyrzucić błąd i czyści się przy stanie `inactive` (Control Center, Face ID).
5. Toast „Wysłano” pojawia się, **zanim** cokolwiek zostało wysłane.

### Dlaczego UI wysyłki „dziwnie się zachowuje”

1. Szkic jest czyszczony przed zamknięciem arkusza, więc **na moment miga ekran „Nie zrobiono zdjęcia”**.
2. **Dwa źródła zapisują do Live Activity** (JS i Swift), każde z innym przeliczaniem procentów, więc pasek w Dynamic Island skacze.
3. Postęp stoi na 2% w czasie kompresji, potem na 97% w czasie moderacji, a po pauzie lub utracie sieci się cofa.
4. Klucze elementów zmieniają się przy potwierdzeniu z serwera. Wiersz i bąbel są budowane od nowa: miga awatar, czat skacze, element zmienia pozycję.
5. Automatyczne ponowienie (`retry_scheduled`) wygląda jak **czerwony błąd**.

**Dobra wiadomość:** około 75% poprawek to sam JS (OTA). Natywnie trzeba zrobić throttling postępu w Swift, jedno źródło dla Live Activity i eksport nakładek wideo.

---

## 1. Metodologia i pomiary

**Skille.** Użyłem: `react-native-best-practices`, `expo-animation`, `expo-native-ui`, `expo-ui`, `expo-data-fetching`, `ios-accessibility`, `systematic-debugging`, `supabase` i `supabase-postgres-best-practices`.

**Audyty.** Pięć równoległych audytów:
- wydajność,
- offline,
- informowanie i push,
- UX wysyłki,
- dane i backend.

Kluczowe ustalenia sprawdziłem ręcznie w kodzie, z dokładnością do pliku i linii.

**Testy.** Istniejące suity dla tych obszarów przechodzą (59 + 62 + 35 testów). Żadna z nich nie wykrywa opisanych błędów, bo testowane są czyste funkcje, a nie przejścia stanów.

**Probe.** W scratchpadzie (poza repo):
- `GoTrueClient` z siecią rzucającą `TypeError`: `elapsedMs: 25419`, 8 prób refreshu;
- outbox: po 9 błędach zadanie czeka 512 s; po TTL zostaje 0 zadań.

**React Doctor:** 0 błędów i 1 ostrzeżenie (`.github/workflows/agent-evals.yml:33`, `build-pipeline-secret-boundary`). Wynik API: 76.

### Bundle JS

Pomiar: `expo export --source-maps --no-bytecode`, potem przypisanie bajtów do źródeł według sourcemapy. Łącznie około 5,6 MB JS (9,5 MB HBC).

| Pakiet | KB | Uwagi |
|---|---:|---|
| react-native-reanimated | 738 | niezbędny |
| react-native | 562 | — |
| expo-router | 470 | — |
| **Sentry** (core, RN, replay, browser, feedback, utils, react) | **≈ 840** | w produkcji **wyłączony**, ale w bundlu jest (`import()` nie dzieli kodu w Metro na native) |
| @shopify/react-native-skia | 258 | ładowany przy każdym starcie tylko dla `NotificationGoo` |
| css-tree + entities | ≈ 187 | pochodzą z `react-native-qrcode-svg` → `LocalSvg` z `react-native-svg/css`; wystarczy shim |
| src (lib, components, app, hooks, services, context) | ≈ 707 | — |
| graphemer | 93 | używane w `avatarEmoji.ts`; `Intl.Segmenter` w Hermes mógłby je zastąpić **[H]** |

Hermes mapuje bytecode do pamięci, więc rozmiar wpływa na start umiarkowanie. Dużo bardziej wpływa na **rozmiar OTA** i czas pobierania aktualizacji. Sentry, css-tree i Skia to razem około 1,3 MB (≈ 23% bundla).

---

## 2. Wspólne przyczyny (naprawa jednej poprawia kilka obszarów)

| # | Przyczyna | Gdzie się objawia |
|---|---|---|
| R1 | React Compiler wyłączony bez przywrócenia memo | inbox, czat (każda litera przerenderowuje ekran), kamera (zoom), banery |
| R2 | `UploadQueueProvider`: brak throttlingu, SQLite przy każdym ticku, kontekst bez memo | jank przy wysyłce, skaczący postęp, koszt baterii |
| R3 | Kilka źródeł prawdy: łączność (5× NetInfo), Live Activity (JS + Swift), stan uploadu (SQLite, React, UserDefaults, React Query) | offline, Dynamic Island, migotanie |
| R4 | Szerokie `invalidateQueries` zamiast łatania cache | burze zapytań, migotanie list, koszt backendu |
| R5 | Klucze UI zależne od id rekordu serwera | migotanie wierszy i bąbli przy potwierdzeniu |
| R6 | Mapowanie błędów: `UNKNOWN` przykrywa kontekst, `err.message` trafia do UI, błąd sieci traktowany jak błąd krytyczny | informowanie, offline, wysyłka |

---

## 3. Szybkość aplikacji

### 3.1 Zimny start / TTI

**PERF-1 [P0, OTA, S]. Splash czeka na profil i wiek, mimo że jest poprawny snapshot.**
- `src/lib/profileGate.ts:34`: `if (input.profilePending || input.agePending) return { status: 'loading' };`. Snapshot jest używany tylko offline albo przy błędzie.
- `src/app/_layout.tsx:288-306`: `retry: 2`, czyli przy słabej sieci dodatkowe 1 s + 2 s.
- **Poprawka:** stale-while-revalidate. Gdy jest `hasValidSnapshot`, od razu zwracać `readyFromSnapshot`, a weryfikację robić w tle. Istniejący `resolveBootstrapRedirect` przekieruje do onboardingu, jeśli trzeba. `retry` ustawić na 0 albo 1.

**PERF-2 [P1, OTA, S–M]. Splash czeka na pełną hydrację cache offline.**
- `_layout.tsx:394`: `appReady = … && (!session || offlineCacheHydrated)`.
- `offlineCacheStore.ts:120-168`: sekwencyjne `await decrypt` w pętli (inbox i do 20 czatów × 5 kluczy) plus dwa `JSON.stringify` na wiersz.
- **Poprawka:** przy `authenticatedOnline` hydratować w tle (ochrona `dataUpdatedAt` już istnieje). Kolejność: najpierw profil i inbox, czaty leniwie przy wejściu. Odszyfrowywać przez `Promise.all`.

**PERF-3 [P1, OTA, S–M]. Keychain przy każdym zapytaniu, pod globalnym lockiem.**
- `src/lib/supabase.ts:38` `lock: processLock`. W auth-js 2.117.3 ta opcja jest oznaczona jako przestarzała, a `getSession()` przechodzi przez `_acquireLock`.
- `authStorage.ts:67-88`: manifest i chunki po 400 znaków z SecureStore przy każdym `getItem`.
- supabase-js woła `getSession()` przed każdym requestem. `getCurrentUser()` (`profileService.ts:14-23`) dokłada drugie wywołanie w niemal każdym serwisie.
- **Poprawka:** cache w pamięci w `authStorage` (write-through, unieważniany przy `setItem`/`removeItem`). Usunąć `processLock` dopiero po teście odświeżania tokenu w tle. `userId` przekazywać z `useAuth` zamiast `getCurrentUser()`. Najpierw zmierzyć w Instruments.

**PERF-4 [P1, OTA, S]. Skia i kompresor są ładowane przy każdym starcie.**
- `_layout.tsx` → `AppNotificationsProvider` → `NotificationPresentation` → `NotificationGoo` (Skia).
- `UploadQueueProvider` → `mediaService` (`react-native-compressor`, `expo-image-manipulator`).
- `metro.config.js` nie włącza `inlineRequires` (domyślnie jest wyłączone).
- **Poprawka:** lazy `require()` dla `NotificationGoo` i dla kompresora. Globalne `inlineRequires` jest możliwe, ale wymaga pełnego QA przez build.

**PERF-5 [P2, OTA, S]. Bundle: Sentry (≈ 840 KB) i css-tree (≈ 187 KB).**
- Gdy `EXPO_PUBLIC_SENTRY_ENABLED !== 'true'`, zastąpić `@sentry/react-native` pustym modułem przez `resolveRequest` w `metro.config.js`.
- Dla `react-native-svg/css` dodać shim, bo QR nie używa `LocalSvg`.
- Po zmianie sprawdzić `npm run check:sentry-disabled`.

**PERF-6 [P2, OTA, S]. Kolor akcentu wczytywany po pierwszym renderze.** `theme-context.tsx:18-28`. Daje drugi render całego drzewa i mignięcie koloru. Wczytać przed `SplashScreen.hideAsync`.

**PERF-7 [P2, OTA, S + QA wizualne]. `fontFamily: 'SF Pro Rounded'` (`src/theme/typography.ts:1`) nie jest systemową rodziną.** iOS po nieudanych lookupach wraca do zwykłego SF, więc zaokrąglonego kroju nie widać. Użyć `'ui-rounded'`.

### 3.2 Re-rendery

**PERF-8 [P0, OTA, M (+ Xcode S)]. `UploadQueueProvider` przerenderowuje Inbox, Czat i Send-to przy każdym ticku.**
- `UploadQueueProvider.tsx:1293`: `const value = { ready, … }` bez `useMemo`. `summary` to nowy obiekt w każdym renderze.
- `:995-1141`: każdy snapshot to `patchDurableUploadJob`, `refresh()`, `listDurableUploadJobs` (SELECT wszystkich zadań z odszyfrowaniem AES), `setJobs`.
- `:1271-1291`: efekt Live Activity i listener `AppState` podpinają się na nowo przy każdym renderze.
- `durableUploadQueueDb.ts:514-537`: zadania `completed` nigdy nie są usuwane (poza zmianą właściciela), więc koszt rośnie z każdą wysyłką.
- Swift `BackgroundUploadCoordinator.swift:884-919`: `didSendBodyData` bez throttlingu, dwa razy `loadSnapshots()` z UserDefaults na chunk.
- **Poprawka JS:**
  - podzielić kontekst na akcje (stabilne) i stan (`useSyncExternalStore` z selektorami `useUploadJobsForPeer`, `useUploadSummary`);
  - postęp trzymać w pamięci, łącząc aktualizacje (co ≥ 250 ms lub ≥ 2%), a do SQLite zapisywać tylko zmiany fazy;
  - `refresh` z numerem sekwencji (patrz SEND-7);
  - czyścić zakończone zadania starsze niż około 60 s z listy i okresowo z bazy.
- **Poprawka Swift:** throttling `onUploadProgress` i `updateLiveActivity`; snapshoty w pamięci.

**PERF-9 [P0, OTA, S/M]. Brak memo w ekranach z „vm”.**
- `useInboxScreen.ts:187-208`: `baseRows` i `allRows` liczone przy każdym renderze, więc `useMemo` na `rows` nie działa.
- `useChatScreen.ts:680`: nowy `vm` w każdym renderze.
- **Decyzja do podjęcia:**
  - (a) Ponownie włączyć React Compiler. Najpierw trzeba ustalić, dlaczego wyłączono go w 1.0.10. Komentarz `useCameraScreen.ts:1092` mówi o „aborted Hermes in TF” przy odtwarzaniu gestu Pan, a ten gest jest już memoizowany. Potem pełne QA przez build.
  - (b) Punktowo przywrócić `useMemo` i `memo` oraz dodać `useDeferredValue(searchQuery)`.
- **Rekomendacja:** (b) teraz, (a) po App Review, osobnym buildem.
- **Weryfikacja z 2026-10-10:**
  - Expo SDK 57 **nie** memoizuje automatycznie. `babel-preset-expo` włącza kompilator tylko przy `experiments.reactCompiler: true` (`@expo/metro-config/build/babel-transformer.js:84`, `rewriteRequestUrl.js:85`).
  - W wyeksportowanym bundlu nie ma żadnego skompilowanego komponentu. Dwa wystąpienia `react.memo_cache_sentinel` pochodzą z samego runtime Reacta.
  - Commit `03a4e3d` przełączył flagę razem z `buildReactNativeFromSource: true` i usunięciem `workletsBundleMode`, co wygląda na szukanie crasha Hermesa.
  - Próbne przepuszczenie `src` przez `babel-plugin-react-compiler` 1.0.0: **221 funkcji kompiluje się, 14 jest pomijanych**. Pomijane są właśnie najgorętsze miejsca: `UploadQueueProvider` (try/finally), `useChatScreen`, `send-to`, `useProfileScreen`, `useLoginScreen`, `friend-scan-qr` (warunki w try/catch), `useViewerScreen` (throw w try), `useCameraScreen` (istniejąca memoizacja), `useAuth` (ref w renderze) i `OfflineCacheProvider`.
  - Wniosek: samo włączenie flagi **nie** naprawi czatu, uploadu, viewera ani kamery. Te miejsca wymagają ręcznej memoizacji albo refaktoru do postaci akceptowanej przez kompilator.

**PERF-10 [P1, OTA, M]. Czat: każda litera przerenderowuje ekran, header i widoczne komórki.**
- `inputBody` jest w `useChatScreen.ts:231`. `renderTimelineItem` zależy od `vm` (`ChatScreenSurface.tsx:1272-1329`). `MessageBubble`, `NixChip` i `UploadBubble` nie są `memo`.
- `app/chat/[peerId].tsx:136-160`: inline `headerTitle`, czyli `setOptions` przy każdej literze.
- **Poprawka:** stan inputu lokalnie w `ChatComposer` (`handleSend(body)`), `memo` dla komórek ze stabilnymi handlerami, stabilne `options`.

**PERF-11 [P1, OTA, S]. Zapis cache offline przy każdym renderze.**
- `OfflineCacheProvider.tsx:54-57` reaguje na każde zdarzenie `queryCache` ze statusem `success`. TanStack emituje `observerOptionsUpdated` przy każdym renderze z inline `queryFn`.
- Każde takie zdarzenie to szyfrowanie i upsert. Dla czatu dodatkowo `SELECT *` całej tabeli tylko po to, żeby przyciąć listę (`offlineCacheStore.ts:93-105`).
- **Poprawka:** `if (event.type !== 'updated' || event.action.type !== 'success') return;`, throttle zamiast debounce, przycinanie przez `SELECT scope_id, MAX(cached_at) … GROUP BY`.

**PERF-12 [P2, OTA, S–M]. Zoom w kamerze ustawia stan React 20–40 razy na sekundę** (`useCameraScreen.ts:362-397`) i przerenderowuje wszystkie kontrolki. Odizolować `zoom` w małym komponencie opakowującym `CameraView`.

**PERF-13 [P2, OTA, S]. Klucz `acceptedFriends` z limitem 100 w inboxie i 50 w pozostałych miejscach** (`useInboxScreen.ts:103`, `useFriendsScreen.ts:50`, `send-to.tsx:195`, `new-chat.tsx:83`, `useProfileScreen.ts:68`). Zrobić jedną funkcję `acceptedFriendsQueryOptions()`.

### 3.3 Listy

**PERF-14 [P1, OTA, S]. Czat renderuje od góry, potem w rAF robi `scrollToEnd`**, co daje widoczny skok (`ChatScreenSurface.tsx:1189-1200`). Użyć `maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}` (FlashList 2.0.2 to obsługuje) i usunąć ręczny `scrollToEnd`.

**PERF-15 [P2, OTA, S]. Martwy `estimatedItemSize` z `@ts-expect-error`** (FlashList v2 go ignoruje): `ChatScreenSurface.tsx:1354`, `send-to.tsx:141`, `new-chat.tsx:150`.

**PERF-16 [P2, OTA, S]. Inbox: `MessageRow` nie jest `memo`, a `vm.rows.map(renderMessageRow)` używa inline closures** (`InboxScreenSurface.tsx:395, 679`).

**PERF-17 [P2, OTA, S–M]. Podpisane URL-e awatarów cache'owane per zestaw ścieżek** (`avatarSignedUrlsQueryKey(avatarPaths)`). Nowy rozmówca albo wyszukiwanie zmienia klucz, więc wszystkie awatary spadają do inicjałów. Dodać `placeholderData: keepPreviousData` albo cache per ścieżka (`['avatarUrl', path]`), trwały z `expiresAt`.

**PERF-18 [P2, OTA, S]. Awatary wysyłane w pełnej rozdzielczości** (`profileScreenActions.ts:94-106`, do 5 MB), a wyświetlane w 36–44 pt. Zmniejszać do 256–384 px przez `ImageManipulator`.

### 3.4 Viewer, wideo, kompresja

**PERF-19 [P0, OTA, M]. Viewer zdjęcia: 5–6 szeregowych zapytań przed pierwszym pikselem.**
- `useViewerScreen.ts:498-500`: czeka na `fetchUnreadInboxQueueFromSender`, choć `seedItem` jest znany od razu.
- `photoCacheService.ts:27-73`: `photoAccess` → odczyt cache → **drugi** `photoAccess` (`:38`) → `createSignedUrl` → pobranie → `photoAccess` → szyfrowanie i zapis → `photoAccess`.
- Na końcu `FadeIn` (≈ 300 ms) i `transition={380}` (`ViewerScreenSurface.tsx:69, 203`).
- **Poprawka:**
  1. Startować seed równolegle z kolejką; efekt kluczować po `id` i `media_path`.
  2. Przy trafieniu w cache `Promise.all(photoAccess, read)`.
  3. Przy braku w cache zwracać URI po weryfikacji, a szyfrowanie i zapis robić w tle.
  4. Prefetch na `onPressIn`.
  5. Fade ≤ 150 ms.

  Punkty 2 i 3 dotyczą modelu bezpieczeństwa i wymagają akceptacji właściciela.

**PERF-20 [P1, OTA, S]. Czarny ekran wideo między podpisanym URL a `readyToPlay`.** Poster znika za wcześnie (`ViewerScreenSurface.tsx:30-57`). Renderować `videoThumbnailOverlay ?? videoPosterUri` pod `VideoView` do `imageReady`.

**PERF-21 [P1, OTA, M]. Brak preloadu następnego wideo** (`useViewerScreen.ts:653`). Zrobić prefetch podpisanego URL i `createVideoPlayer(source)` z wyprzedzeniem, z `release()` niewykorzystanego playera.

**PERF-22 [P1, OTA, S, do zmierzenia]. Fast-path wideo z kamery prawdopodobnie nigdy nie działa.**
- Kamera nagrywa z 1,8 Mb/s (`cameraCaptureProfile.ts`), a passthrough wymaga `sourceBitrate <= 1_800_000` (`durableUploadPolicy.ts:221-229`).
- `sourceBitrate` liczony jest z rozmiaru całego pliku, łącznie z audio i kontenerem (`mediaService.ts:352-357`), więc prawie zawsze wypada ponad limit. Każde nagranie jest transkodowane.
- **Poprawka:** tolerancja `bitrate + audioBitrate + 10%`. Najpierw sprawdzić w telemetrii stosunek `compression_skipped` do `compression_ms`.

**PERF-23 [P1, OTA M / Xcode M–L]. Wideo z nakładką kodowane dwa razy.**
- Najpierw `bakeMediaOverlays` w arkuszu send-to z presetem `AVAssetExportPresetHighestQuality` (`NixMediaOverlayModule.swift:619-621`), potem drugi transkod w kolejce.
- **Poprawka:** wypalanie nakładek przenieść do fazy `preparing` w kolejce (JS), a natywnie eksportować od razu w profilu docelowym (1280 px, 1,8 Mb/s).

**PERF-24 [P2, OTA, S].**
- Stare nixy bez miniatury czekają na `generateVideoThumbnailAtTime` przed odtworzeniem (`useViewerScreen.ts:568-575`).
- `timeUpdateEventInterval = 1/30` (`ViewerNixVideo.tsx:31`) — postęp segmentu lepiej liczyć przez `withTiming` na wątku UI.

**PERF-25 [P2, Xcode, L]. Zdjęcia odszyfrowane trafiają do JS jako base64 (do około 5,3 MB stringa)** (`encryptedPhotoCache.ts:247-253`). Docelowo moduł natywny zwracający `ImageRef`.

### 3.5 Animacje

**PERF-26 [P1, OTA M; Xcode, jeśli keyboard-controller].**
- Klawiatura w czacie animuje `marginBottom`, `paddingBottom` i `height` (layout co klatkę) i co klatkę woła `scheduleOnRN(scrollToOffset)` (`ChatScreenSurface.tsx:1014-1026, 1154-1191`).
- **Poprawka:** `translateY` dla composera, `scrollTo` w workletcie. Docelowo `react-native-keyboard-controller`, ale to nowy moduł natywny (zasady 1 i 5).

**PERF-27 [P2, OTA, S]. Drobne.**
- `.value` zamiast `.get()` w workletach czatu.
- Viewer blokuje tapnięcie przez 350 ms (`useViewerScreen.ts:251-260`).
- Czasy trzymać w `src/theme/motion.ts`.

### 3.6 Natywne

**PERF-28 [P2, Xcode, S]. Target widgetu Live Activity ma w konfiguracji Release `SWIFT_OPTIMIZATION_LEVEL = "-Onone"`** (`ios/NiX.xcodeproj/project.pbxproj:751`). Usunąć to nadpisanie.

**Sprawdzone i w porządku:**
- Hermes, New Architecture, `CADisableMinimumFrameDurationOnPhone`, prekompilowane moduły;
- expo-updates nie blokuje startu (`LaunchWaitMs=0`);
- brak legacy `Animated` i `LayoutAnimation`;
- `AvatarCircle` z `cacheKey = storagePath`;
- formatery `Intl` cache'owane;
- inbox nie pobiera `thumbnail_b64`;
- pozostałe konteksty mają memoizowane wartości.

---

## 4. System offline

### 4.1 Jak działa dziś (skrót)

**Łączność.**
- 5 niezależnych `NetInfo.addEventListener`: `reactQueryNetwork.ts`, `useAuth.ts`, `UploadQueueProvider.tsx`, `TextOutboxSync.tsx`, `AppRealtimeSync.tsx`.
- Różna semantyka: raz `isConnected`, raz `isConnected && isInternetReachable`.
- Brak `NetInfo.configure`, więc reachability sprawdza Google `generate_204` (timeout 15 s).

**Stan UI.** `useAuth().canUseNetworkSession`. Zapytania mają `enabled: canUseNetworkSession`. Nie ma `useMutation`, więc nie ma kolejki mutacji.

**Cache.**
- `OfflineCacheProvider`: AES-GCM w SQLite, klucz per użytkownik w SecureStore.
- Kategorie: profile, social, settings, inbox, czaty (≤ 20 × 50 wiadomości).
- Hydracja przed zdjęciem splasha.

**Outbox tekstu.**
- Zaszyfrowany SQLite, TTL 24 h, idempotencja przez `client_message_id`.
- Backoff 2^n s, maksymalnie 15 min.
- Flush przy montowaniu, co 30 s, przy zdarzeniu NetInfo i przy foreground.

**Upload.** Trwała maszyna stanów w SQLite, natywny URLSession z `waitsForConnectivity`. Background task robi tylko reconcile i purge.

**Realtime.** Montowany tylko online. `syncForeground` przy montowaniu, przy `SUBSCRIBED` i przy `AppState=active`.

**UX.** `OfflineStatusBanner` na części ekranów. Nie ma globalnego wskaźnika ani informacji „ostatnia synchronizacja” (`lastSyncedAt` jest liczone, ale nieużywane).

**Wcześniejsze zgłoszenia.** F05, F09 i F23 z `PROJECT_ANALYSIS_2026-10-07` są już naprawione i mają testy.

### 4.2 Błędy

**OFF-1 [P1, OTA, S]. Zimny start offline z wygasłym JWT pokazuje splash przez około 25 s (probe: 25 419 ms, 8 prób refreshu).**
- `useAuth.ts:230-238` czeka na `supabase.auth.getSession()` bez timeoutu. auth-js ponawia refresh z backoffem do około 30 s.
- **Repro:** zalogowany użytkownik, aplikacja zamknięta ponad godzinę, tryb samolotowy, zimny start.
- **Poprawka:** jeśli jest lokalna sesja, a NetInfo mówi offline (albo minęły 2–3 s), od razu ustawić `authenticatedOffline` i dokończyć `getSession()` w tle.

**OFF-2 [P1, OTA, S]. Upload dostarczony na serwer zostaje oznaczony jako `failed`.**
- `UploadQueueProvider.tsx:1148-1158`: `settleMediaModeration` dla każdego zadania `finalizing`, **bez warunku online**.
- `mediaBatchUploadService.ts:77-83, 112`: każdy błąd RPC zamienia się w `UNKNOWN`, a po 30 s jest timeout.
- `:333-341`: catch ustawia `state: 'failed'`.
- **Repro:** wyślij nix, w trakcie moderacji włącz tryb samolotowy albo zamknij aplikację, potem zimny start offline. Druga ścieżka: moderacja wideo trwająca ponad 30 s.
- **Skutek:** czerwony błąd przy treści, która została już dostarczona. Do tego duplikat w czacie (SEND-9).
- **Poprawka:** błąd sieci i timeout zostawiają `finalizing`, z ponownym odpytaniem po powrocie sieci. `failed` tylko dla `rejected` lub `error` z serwera. Efekt pilnować warunkiem `canUseNetworkSession && online`. Docelowo koniec oczekiwania sygnalizowany przez realtime INSERT na `nixes` zamiast pollingu.

**OFF-3 [P1, OTA, S]. Wiadomość wisi do 15 min po powrocie sieci (probe: po 9 błędach czeka 512 s).**
- `textOutboxService.ts:236-238` filtruje `nextAttemptAt <= now`. Nic nie resetuje backoffu przy powrocie łączności.
- Dla stanu `pending` UI ma tylko spinner (`ChatScreenSurface.tsx:365-367`).
- **Poprawka:** przy przejściu offline→online, przy foreground i przy ręcznym „Wyślij teraz” zerować `next_attempt_at`. Dodać stan „Czeka na sieć” (OFF-7).

**OFF-4 [P1, OTA, S]. Wiadomości z outboxa znikają bez śladu po 24 h** (`textOutboxService.ts:18, 160, 235`; probe: 0 zadań). TTL treści zostaje (wymóg bezpieczeństwa), ale zamiast DELETE zapisywać nagrobek bez payloadu w stanie `expired`. UI pokazuje „Nie wysłano — wygasło”.

**OFF-5 [P2, OTA, S]. Nowa wiadomość czeka na trwający flush.** `flushTextOutbox` zwraca istniejącą obietnicę, która ma listę zadań sprzed dodania nowej (probe: `still queued: ['new:pending']`). Dodać flagę `rerunRequested`.

**OFF-6 [P2, OTA, S].**
- Błąd wysyłki w tle nie odświeża UI: `TextOutboxSync.tsx:13-14` invaliduje tylko przy sukcesie.
- `RATE_LIMITED` i `UNAUTHORIZED` są terminalne (`textOutboxPolicy.ts:7-8`), a powinny być ponawiane z dłuższym backoffem.

**OFF-7 [P2, OTA, S]. Brak stanu „czeka na sieć” dla tekstu** (`chatOutboxMessages.ts:21`). Upload ma `uploadWaitingNetwork`, tekst pokazuje wieczny spinner.

**OFF-8 [P2, OTA, S]. Cache offline gubi ostatni zapis i nadpisuje świeższe dane.**
- Przejście w offline czyści timery zamiast je wykonać (`OfflineCacheProvider.tsx:78-81`).
- `hydrateOwner(userId, true)` z `force` przy foreground offline nadpisuje pamięć starszymi danymi z dysku (`:152, 211-216`).
- **Repro:** przychodzi wiadomość, w ciągu 300 ms włączasz tryb samolotowy, aplikacja idzie w tło i wraca — wiadomość znika.

**OFF-9 [P2, OTA, M]. Pozostałe ścieżki odmontowujące cały Stack** (`_layout.tsx:442-483`). Uzupełnienie commitu 00f5422.
- Ścieżka 1: `recoverableError` po powrocie sieci (błąd auth 5xx).
- Ścieżka 2: `offlineNeedsVerification` (onboarding albo nieudany zapis snapshotu; `_layout.tsx:343` nie ma `.catch`).
- **Poprawka:** po pierwszym `appReady` nigdy nie podmieniać Stacka, a błąd pokazywać jako overlay.

**OFF-10 [P2, OTA, S]. Czat offline bez cache wyświetla „Brak wiadomości. Wyślij pierwszą wiadomość!”** (`ChatScreenSurface.tsx:1142, 1344`). Dodać stan „Brak danych offline”, analogicznie do `offlineCacheMissing` w inboxie.

**OFF-11 [P2, OTA, M]. Upload nagrany offline nic nie robi, dopóki aplikacja nie zostanie otwarta.**
- Kompresja i `begin` startują tylko online (`UploadQueueProvider.tsx:1162`).
- **Poprawka:** przygotowanie mediów niezależne od sieci; w background tasku próba `begin` i natywnego enqueue.

**OFF-12 [P2, OTA, S]. Kanał realtime może być „martwy” po szybkim remount [H].** `supabase.channel('app-sync-${userId}')` ze stałym topikiem zwraca stary kanał w stanie `leaving`. Wtedy `subscribe()` nic nie robi, a polling awaryjny nie startuje.
- **Poprawka:** `await supabase.removeChannel(ch)` przed ponownym utworzeniem; polling awaryjny startować też przy montowaniu.

**OFF-13 [P2]. Drobne.**
- `deleteTextOutboxJob` i `retryTextOutboxJob` nie filtrują po `owner_id` (`textOutboxService.ts:187-203`).
- `queryKeys.inboxActivityBundle` nie ma obserwatora, więc jego invalidacje to martwy kod.
- Reachability przez Google: sieci, które je blokują, pokazują stałe „offline” [H].

### 4.3 Architektura docelowa offline

1. **Jeden `connectivityStore`** (`useSyncExternalStore`):
   - `NetInfo.configure({ reachabilityUrl: <SUPABASE_URL>/auth/v1/health, reachabilityHeaders: { apikey } })`;
   - histereza: offline dopiero po około 2 s ciągłego braku, online od razu;
   - jedyne miejsce, które woła `onlineManager.setOnline`;
   - outbox, upload, realtime i auth subskrybują ten store, a nie NetInfo bezpośrednio.
2. **Auth optymistycznie offline.** Lokalna sesja daje natychmiast `authenticatedOffline`, a refresh odbywa się w tle. Splash nigdy nie czeka na sieć.
3. **Persystencja zapytań.** Poprawić obecny store (filtr `updated/success`, bez `force`, flush zamiast clear) albo przejść na `persistQueryClient` z zaszyfrowanym persisterem SQLite (`shouldDehydrateQuery = describeOfflineCacheQuery`, `buster = appVersion+userId`).
4. **Outbox v2.**
   - Tekst, reakcje i potwierdzenia odczytu w jednej kolejce.
   - FIFO per rozmówca.
   - Reset backoffu przy odzyskaniu sieci.
   - Stany `queued_offline | sending | failed | expired`.
   - Invalidacja po każdej zmianie stanu i `rerun` po flushu.
5. **Upload.** `finalizing` odporny na brak sieci, koniec moderacji sygnalizowany przez realtime, przygotowanie mediów offline.
6. **Realtime.** Gap-fill wyłącznie na `SUBSCRIBED`, `removeChannel` przed ponownym utworzeniem, `signal` w `queryFn`.
7. **UX.** Jeden kompaktowy pasek offline w layoucie tabów z „Ostatnia synchronizacja: …”. Rozróżnienie „brak danych offline” od „pusto”. Akcje offline wyłączone inline zamiast czerwonych toastów.

---

## 5. Informowanie: banery, push, Live Activity

### 5.1 Jak działa dziś

**Banery.**
- `appNotify.ts` → `notificationQueue.ts` (1 widoczny + 2 oczekujące, fazy, tokeny generacji).
- `AppNotificationsProvider` → `FullWindowOverlay` → karta Skia „goo” wysuwana z Dynamic Island, `BlurView` i SF Symbol.
- Około 135 wywołań w 24 plikach.

**Push.**
- `PushNotificationsProvider` wycisza tylko czat aktywnego rozmówcy.
- `push-dispatch` → Expo Push.
- Plakietka liczy tylko nieprzeczytane NiXy.

**Upload.** Live Activity i status inline w inboxie. Nie ma banera o błędzie wysyłki.

**Co działa dobrze:**
- tokeny generacji;
- brak wycieków timerów;
- animacja na wątku UI;
- Reduce Motion obsłużone;
- brak duplikacji push i banera.

### 5.2 Problemy

**NOTIF-1 [P0, OTA, S]. `notifyDomainError` pokazuje „Wystąpił nieoczekiwany błąd.” zamiast kontekstu.**
- `errors.ts:32` zamienia każdy `Error` (także `PostgrestError` i błędy sieci) w `DomainError('UNKNOWN')`.
- `appNotify.ts:29` tłumaczy `domainErrors.UNKNOWN`, a ten klucz **istnieje** (`i18n.ts:872/1735`). Dlatego `defaultValue: fallbackMessage` nigdy nie wchodzi do gry.
- Test `appNotify.test.ts` mockuje `i18n.t` i nie wykrywa problemu.
- Dotyczy około 30 miejsc, m.in. `useChatScreen.ts:357, 428…`, `useInboxScreen.ts:316…`, `useViewerScreen.ts:808`, `profile/notifications.tsx:47`, `data-export.tsx`.
- **Poprawka:**
  - dla `UNKNOWN` tytułem jest `fallbackMessage` („Nie udało się wysłać wiadomości”), opisem „Spróbuj ponownie.”;
  - błędy sieci („Network request failed”, `fetch failed`, `!online`) klasyfikować osobno jako `errors.offline` typu info, z deduplikacją;
  - testy na prawdziwych `resources`.

**NOTIF-2 [P0, OTA, S]. Brakuje 13 kluczy i18n, więc użytkownik widzi nazwę klucza albo polski tekst w wersji EN.**
- `useInboxScreen.ts:314-336`: `friends.acceptSuccess`, `acceptFailure`, `rejectSuccess`, `rejectFailure`.
- `useProfileScreen.ts:137-155`: `profile.privacyUpdateFailed`, `rateAppUnavailable`, `supportUnavailable` z polskim `defaultValue`.
- Dalej: `auth.displayName*` (`onboarding.tsx`), `profile.setDisplayName`, `profile.rateApp`, `profile.contactSupport`.
- **Poprawka:** dodać klucze pl i en. Dodać test pokrycia kluczy (skan `t('…')`) albo `CustomTypeOptions`, żeby `tsc` łapał braki. Zakaz polskiego `defaultValue`.

**NOTIF-3 [P1, OTA, S]. Surowe `err.message` w banerach.**
- `useFriendsScreen.ts:159, 174, 189, 205, 221`, `friend-scan-qr.tsx:179`, `friend-invite-confirm-content.tsx:254`, `profileScreenActions.ts:206`, `send-to.tsx:348`.
- **Poprawka:** wszystko przez mapowanie z NOTIF-1; reguła lint `no-restricted-syntax` dla `notify*(… .message …)`.

**NOTIF-4 [P1, OTA, M]. Komunikat jest czytelny dopiero po około 1,3 s, a znika po około 1,4 s.**
- `vendor/timeline.ts:3-14`. Sukces zajmuje ekran około 6,7 s.
- Haptyka odpala przy odsłonięciu, czyli około 1,3 s po akcji.
- Kolejny komunikat czeka na pełne zejście poprzedniego.
- **Poprawka:**
  - wejście ≤ 350 ms, wyjście ≤ 250 ms;
  - morph z wyspy tylko dla rzadkich zdarzeń;
  - haptyka w momencie przyczyny;
  - błąd przerywa (wywłaszcza) inny widoczny komunikat.

**NOTIF-5 [P1, OTA, S]. Kolejka gubi błędy.**
- FIFO `slice(-(MAX_PENDING-1))` bez priorytetu (`notificationQueue.ts:84`).
- `setActive(state === 'active')` czyści kolejkę także przy `inactive` (Control Center, Face ID, prompt uprawnień), a `enqueue` przy nieaktywnej aplikacji odrzuca komunikat po cichu (`:70, 138-141`).
- **Poprawka:** priorytet error > warning > success > info, błąd nigdy nie wypada; czyszczenie tylko przy `background`; przy `inactive` pauza timera.

**NOTIF-6 [P1, OTA S / Xcode M, H mocne]. Arkusz otwarty po pojawieniu się banera go zasłania.** `FullWindowOverlay` dodaje kontener do okna raz (`RNSFullWindowOverlay.mm:150-163`). Arkusze UIKit otwarte później (formSheet, ImagePicker, share) są nad nim, a timer i tak leci.
- **Poprawka:** `key` per komunikat na `FullWindowOverlay` (JS). Docelowo własny `UIWindow` pass-through na poziomie `.alert` (Xcode).

**NOTIF-7 [P1, OTA, S]. Przy VoiceOver karta nigdy nie znika** (`notificationQueue.ts:100`) i zasłania przycisk Wstecz. Czas powinien być skończony: max(10 s, 2× normalny).

**NOTIF-8 [P1, OTA, S]. Brak sieci jako czerwony błąd** (`useFriendsScreen.ts:111…230`), a w innych miejscach ten sam tekst jako `info`. Offline pokazywać inline (pasek, wyłączone akcje), bez toastu przy każdym tapnięciu.

**NOTIF-9 [P1, OTA, S]. „Wysłano” pokazuje się przed wysyłką** (`send-to.tsx:339`). Nie ma banera przy ostatecznym błędzie wysyłki. Rationale pushy po 400 ms nakłada się na animację banera. Szczegóły w SEND-10.

**NOTIF-10 [P1, OTA + Xcode, S]. Live Activity i inbox pokazują auto-retry jako błąd.**
- `uploadLiveActivityPresentation.ts:25-29` mapuje `retry_scheduled` i `waiting_for_auth` na `failed` („Błąd wysyłania — stuknij, aby spróbować ponownie”).
- `InboxScreenSurface.tsx:164, 220-230` i `i18n.ts:217`: czerwony tekst w dwóch liniach.
- **Poprawka:** osobna faza „Ponawianie…” w neutralnym kolorze. Mapowanie w Swift (`BackgroundUploadCoordinator.swift:1113-1115`) wymaga builda.

**NOTIF-11 [P2, OTA, S]. Wyciszanie push opiera się na montowaniu czatu, nie na fokusie** (`useChatScreen.ts:247-255`).
- Czat schowany pod viewerem nadal wycisza powiadomienia.
- Przejście A → B → zamknięcie B zdejmuje wyciszenie A.
- `new_nix` od aktywnego rozmówcy nie jest wyciszany.
- Tap na push robi zawsze `router.push`, więc może zduplikować ekran [H].
- **Poprawka:** `useFocusEffect` i `router.navigate`.

**NOTIF-12 [P2, OTA, S]. Rationale pushy po pierwszej wysyłce nigdy się nie pojawia** (`PushNotificationsProvider.tsx:248-249`), wbrew `docs/push-notifications.md:24`.

**NOTIF-13 [P2, Backend, S].**
- Tytuł pusha jest ogólny, a nadawca trafia do treści. Formy „zareagował(a)”.
- Brak `ttl` (`_shared/push.ts:70-88`, `push-dispatch/index.ts:172-178`), więc retry do 60 min może dostarczyć nieaktualny push.
- **Poprawka:** tytuł = nadawca, treść w formie neutralnej, `ttl` dla czatu.

**NOTIF-14 [P2].**
- Plakietka nie liczy tekstów (decyzja produktowa).
- Podwójne ogłoszenie VoiceOver przy wklejeniu obrazu.
- `accessibilityLiveRegion` nie działa na iOS (`ChatScreenSurface.tsx:1114`, `CameraCaptureSurface.tsx:171`).
- Ustawienia powiadomień offline pokazują wartości domyślne jako stan rzeczywisty (`profile/notifications.tsx:32`).
- Niespójna obsługa odmowy uprawnień.
- Kolory hardcoded w `NotificationPresentation.tsx:60`, `NotificationGoo.tsx:33, 49, 54` i `NotificationCardBody.tsx:20` (zasada 3).
- Ten sam `id` nie aktualizuje treści.
- Skia `saveLayer` z blur i animowany `intensity` w `BlurView` to koszt GPU podczas przejść [H, do zmierzenia na Release].
- Sztywny rozmiar wyspy 126×37,33 pt [H].

### 5.3 Docelowy system informowania

| Sytuacja | Kanał |
|---|---|
| Stan obiektu lub ekranu (upload w wierszu, błąd pola, offline, pusta lista) | **Inline**, trwały, z `announceForAccessibility`. **Domyślny wybór.** |
| Wynik akcji, którego nie widać inline (zapis w Zdjęciach, zgłoszenie wysłane) | **Baner** |
| Potrzebna decyzja (usunięcie, uprawnienie → Ustawienia) | **Alert systemowy** |
| Długi proces (upload) | **Live Activity** i status inline. Baner tylko przy ostatecznym błędzie, gdy użytkownik nie patrzy na inbox lub czat |
| Zdarzenie od innej osoby | **Push**, gdy aplikacja jest w tle albo chodzi o inną rozmowę |
| Brak sieci | **Zawsze inline**, nigdy jako czerwony toast |

**Reguły kolejki:**
- priorytet error > warning > success > info;
- 1 widoczny + 3 oczekujące; błąd nie wypada przy przepełnieniu;
- jawny `key`: ten sam klucz aktualizuje widoczny komunikat i resetuje timer;
- czasy: info i success 3 s, warning 4 s, error 5–8 s, VoiceOver ×2 (minimum 10 s);
- wejście ≤ 350 ms, wyjście ≤ 250 ms;
- haptyka raz, w momencie przyczyny.

**API:**
```ts
notify({ kind, title, message?, key?, action? })
notifyFailure(err, { action: 'friends.accept' }) // offline → info, DomainError → tekst domenowy, reszta → `${action}.failure` + „Spróbuj ponownie.”
```
Nigdy nie pokazywać `err.message`. Wywołania tylko z warstwy ekranu.

**Teksty (pl i en zawsze razem):**
- sukces: czas przeszły, ≤ 40 znaków, bez kropki („Zapisano w Zdjęciach”);
- błąd: tytuł „Nie udało się …”, opis z następnym krokiem;
- formy neutralne płciowo.

**Wdrożenie:** teraz uproszczona karta przez OTA. Przy najbliższym buildzie natywnym: własne okno nad arkuszami i treść w `@expo/ui/swift-ui`.

---

## 6. UI wysyłki

### 6.1 Przebieg dziś (maszyna stanów)

1. **Capture.** Zdjęcie: `setPhotoDraft` + `push('/preview')`. Wideo: segmenty i parametry.
2. **Preview** (karta). Nakładki; szklany przycisk Wyślij otwiera `/send-to`.
3. **Send-to** (formSheet). Wybór odbiorców.
4. **„Zabezpieczanie…”** w arkuszu. Wypalanie nakładek (dla wideo pełne przekodowanie), potem `enqueueMediaBatch` (SQLite `staging` → `queued`/`waiting_network`).
5. **Przekazanie.** Wyczyszczenie szkicu, toast „Wysłano” z haptyką sukcesu, `dismissAll()` + `replace('/(tabs)/inbox')`, po 400 ms rationale pushy.
6. **Kolejka:**
   - `preparing` (0.02–0.28, UI stoi na 2%);
   - `requesting_target` (0.30);
   - `uploading` (0.31 + 0.64·p);
   - `finalizing` (0.97; moderacja do 30 s, wygląda jak upload zawieszony na 97%);
   - `completed` → zielone „Wysłano” do 30 s.
7. **Potwierdzenie z serwera.** Realtime odświeża inbox i czat; element optymistyczny zamienia się w wiersz z serwera.
8. **Live Activity.** Dwa źródła zapisu: JS i Swift.

Ten sam upload jest trzymany w **8 miejscach**: SQLite, React `jobs`, UserDefaults, `fallbackSnapshots`, `nativeEventTimesRef`, 2× Live Activity, cache inboxu i czatu.

### 6.2 Glitche

**SEND-1 [P0, OTA, S]. Po wysłaniu miga ekran błędu podglądu albo znikają nakładki.**
- `send-to.tsx:337-341` czyści szkic **przed** `dismissAll()`.
- `preview.tsx:883-890` przy braku `photoUri` renderuje `PreviewMediaError` („Nie zrobiono zdjęcia”).
- Dla wideo `clearSegments` zeruje nakładki, a efekt `preview.tsx:828-832` odtwarza szkic z parametru `uri`, więc stary film może wrócić przy następnym wejściu.
- **Poprawka:** szkic czyścić po zakończeniu przejścia (`transitionEnd` albo przy odmontowaniu podglądu z flagą „wysłano”). Podgląd w stanie „wysyłanie” trzyma ostatnią klatkę. Efekt nie odtwarza segmentów po wysyłce.

**SEND-2 [P0, Xcode + OTA, M]. Dynamic Island skacze; aktywność kończy się „Wysłano”, choć wysyłka trwa.**
- JS: `0.31 + p·0.64` (`UploadQueueProvider.tsx:1095`). Swift: surowa średnia `progress` (`BackgroundUploadCoordinator.swift:1118-1120`). Oba źródła publikują.
- JS dodatkowo robi dwie aktualizacje na jedno wywołanie (`uploadLiveActivity.ts:63-69`).
- Swift widzi tylko zadania przekazane do URLSession, więc w czasie kompresji drugiego segmentu albo moderacji uznaje wysyłkę za zakończoną.
- **Poprawka:** jedno źródło zapisu (natywne nie publikuje, gdy aplikacja jest aktywna, albo używa tego samego modelu faz i postępu z App Group). Wymaga builda.

**SEND-3 [P1, OTA, M]. Postęp: 2% → skok → 97% → cofanie się.**
- Postęp kompresji idzie tylko do SQLite, bez `refresh()` (`:426-430`).
- Faza `thumbnail` i drugi, agresywny przebieg kompresji cofają wartość (`mediaService.ts:439, 468`).
- Stany `paused`, `waiting_network` i `queued` dostają surowy postęp natywny (`:1095-1099`).
- `finalizing` jest mapowane na `uploading` (`inboxUploadPresentation.ts:59-61`).
- **Poprawka:** jedna funkcja `toDisplayProgress` z pasmami (przetwarzanie 0–0.25, wysyłanie 0.25–0.95, potwierdzanie ≥ 0.95, nieokreślony wskaźnik). W obrębie jednej próby postęp nigdy nie maleje. Osobna faza „Sprawdzanie…”.

**SEND-4 [P1]. Burza re-renderów przy postępie.** Patrz PERF-8.

**SEND-5 [P1, OTA, S]. Klucz wiersza inboxu zmienia się przy potwierdzeniu** (`InboxScreenSurface.tsx:664` `key={row.id}`, a id to `upload:${peerId}` albo `sent-nix-${id}`). Cały wiersz SwiftUI z awatarem jest tworzony od nowa. Klucz wątku powinien być `peer:${peerId}`.

**SEND-6 [P1, OTA, S]. Nowy rozmówca powoduje miganie wszystkich awatarów** (`useInboxScreen.ts:235-240`, brak `placeholderData`). Patrz PERF-17.

**SEND-7 [P1, OTA, S]. `refresh()` może nadpisać nowsze dane starszymi [H]** (`:305-314`, brak numeru sekwencji). Dodać rosnący `requestId`.

**SEND-8 [P1, OTA M; Backend S]. W czacie bąbel uploadu zamienia się w NiX: nowy montaż, skok przewijania, zmiana pozycji.**
- Upload ma `id = job.id`, a NiX `nix.id` (`chatTimeline.ts:217-222`).
- `scrollToEnd({animated:false})` przy zmianie ostatniego id (`ChatScreenSurface.tsx:1189-1198`).
- Serwer nadaje `created_at` w momencie `begin`, czyli po kompresji, więc teksty wysłane w trakcie kompresji przeskakują przed NiX.
- **Poprawka:** stały klucz `media-${job.id}`; NiX dopasowany po `client_upload_id === job.batchId` dziedziczy ten klucz i typ komórki. Kolejność kotwiczona do `job.createdAt`. Docelowo serwer przyjmuje czas utworzenia od klienta (nowa migracja).

**SEND-9 [P1, OTA, S]. Duplikat: bąbel „błąd” obok dostarczonego NiX-a.** Wynika z timeoutu moderacji (OFF-2) i z tego, że `chatUploadPresentation.ts:47-48` ukrywa zadanie tylko przy `completed`. Ukrywać każde zadanie, którego `batchId` ma odpowiednik na serwerze.

**SEND-10 [P1, OTA, S]. Nieczytelne przekazanie po wysyłce.**
- Toast „Wysłano” z haptyką sukcesu pojawia się przed wysyłką. Przy prawdziwym końcu nie ma ani haptyki, ani informacji.
- Wysyłka z czatu (`recipientId`): `dismissAll` zamyka także czat i wyrzuca do inboxu.
- `dismissAll` i `replace` w jednym cyklu nakładają się [H].
- **Poprawka:**
  - przy wysłaniu tylko `tap('medium')`;
  - `router.dismissTo(origin)` (czat albo inbox);
  - `notify('success')` raz na batch przy prawdziwym `completed`;
  - rationale pushy po pierwszym sukcesie.

**SEND-11 [P1, OTA, M]. Wypalanie nakładek na wideo w arkuszu: długi spinner bez anulowania.** Arkusz można zsunąć w trakcie [H], a potem nawigacja do inboxu następuje z dowolnego miejsca. Patrz PERF-23. W czasie `isSending` zablokować zamknięcie arkusza.

**SEND-12 [P1, OTA, S]. „Ponów” w czacie nic nie robi dla `paused` i `retry_scheduled`** (`chatUploadPresentation.ts:58-67` kontra `UploadQueueProvider.tsx:751`). Dla `paused` akcja `resume`; ręczne ponowienie zeruje `nextAttemptAt`.

**SEND-13 [P1]. Auto-retry wygląda jak czerwony błąd, a wiersz rośnie do dwóch linii.** Patrz NOTIF-10.

**SEND-14 [P2, OTA, S].**
- Inbox sortuje po `upload.updatedAt`, więc dwa uploady zamieniają się miejscami przy każdym ticku (`inboxUploadPresentation.ts:221-225`).
- Potwierdzenie przez porównanie zegarów zamiast `client_upload_id` (`:159-168`).
- Przełączanie ważenia bajtami (`bytesTotal: 0` w zastępczym snapshocie).
- Czat pokazuje tylko nieokreślony spinner, a inbox pierścień z procentami.
- Surowy `SymbolView` zamiast `AppIcon` (zasada 2).
- Procent wyświetlany dwa razy, a etykieta dostępności zmienia się przy każdym ticku.
- Podwójne tapnięcie „Wyślij” w podglądzie otwiera dwa arkusze [H].

### 6.3 Docelowy UX wysyłki („żeby było ładnie”)

1. **Jeden model.** Czysta funkcja `deriveSendPresentation(job, serverMatch)`, używana w inboxie, czacie i Live Activity.
   - Stany: `queued → processing → sending → confirming → sent → delivered`, plus `paused`, `offline`, `attention`.
   - Postęp nigdy nie maleje w obrębie jednej próby.
2. **Stałe klucze.** Inbox: `peer:${peerId}`. Czat: `media-${job.id}` przez cały cykl życia. Jeden komponent `OutgoingMediaBubble` o **stałej wysokości** w każdym stanie, więc nic nie skacze.
3. **Wygląd iOS:**
   - miniatura z pierścieniem postępu (SwiftUI `ProgressView(value:)` w `Host matchContents`, `animation(easeOut 0.25)`);
   - procent jako `Text` z `contentTransition('numericText')` i `monospacedDigit()`;
   - pod bąblem stopka w stylu iMessage: „Wysyłanie…” → „Wysłano” → „Dostarczono” (`caption`, `secondaryLabel`);
   - błąd: `exclamationmark.circle.fill` przez `AppIcon` i `ContextMenu` z akcjami „Ponów” i „Usuń”;
   - przy wysłaniu jednorazowy `checkmark` z `symbolEffect('bounce')`.
4. **Ruch.** Przejścia wewnątrz komórki to tylko opacity i kolor (150–200 ms, ease-out) z obsługą `useReducedMotion`. Bez `entering` na wierszach listy. `scrollToEnd({animated:true})` tylko przy **nowym** elemencie.
5. **Haptyka:**
   - `tap('medium')` przy zamknięciu arkusza;
   - `success` raz na batch przy prawdziwym sukcesie;
   - `error` raz przy błędzie trwałym;
   - przy ponowieniach brak haptyki.
6. **Nawigacja.** `dismissTo(origin)`, szkic czyszczony po przejściu, wypalanie nakładek w kolejce, a nie w arkuszu.
7. **Live Activity.** Jedno źródło zapisu, 4 fazy: Przygotowywanie / Wysyłanie X% / Sprawdzanie / Wysłano.
8. **Teksty.** Nowe klucze pl i en: „Sprawdzanie…”, „Ponawianie…”, „Dostarczono”, „Czeka na sieć”.

---

## 7. Warstwa danych i backend

### 7.1 Klient

**DB-1 [P0, OTA, S]. Pole tekstowe w czacie zablokowane przez cały cykl moderacji.**
- `useChatScreen.ts:338-353`: `handleSend` czeka na `flushTextOutbox`, który odpytuje moderację co 400 ms, maksymalnie 30 s.
- `ChatScreenSurface.tsx:1044`: `editable={!vm.sending}`.
- **Poprawka:** `handleSend` tylko zapisuje do outboxa i od razu zwalnia pole; flush działa w tle. Wiadomość i tak jest pokazywana optymistycznie z outboxa.

**DB-2 [P0, OTA + Backend, S/M]. Realtime `message_reactions` z `event: '*'` bez filtra** (`AppRealtimeSync.tsx:140-144`).
- Do tego DELETE na `text_messages` (bez `REPLICA IDENTITY FULL`).
- Cron `cleanup-text-messages` co 10 min usuwa wiadomości i kaskadowo reakcje.
- Każde usunięcie reakcji w całej aplikacji trafia do każdego klienta i unieważnia jego inbox (6 zapytań) oraz wszystkie czaty. Każde zdarzenie INSERT i UPDATE jest sprawdzane przez RLS osobno dla każdego subskrybenta.
- **Poprawka:**
  - JS: usunąć tę subskrypcję i DELETE na `text_messages`; wygasanie obsłużyć lokalnie po `expires_at`.
  - Backend: Broadcast z triggera (`realtime.broadcast_changes`) na prywatny topic `user:<id>`.

**DB-3 [P1, OTA, S]. Podwójny `syncForeground`.**
- Wywołania: przy montowaniu (`:80`), przy `SUBSCRIBED` (`:168-170`) i przy `AppState=active` także z `inactive` (`:176-180`). Do tego `refetchOnReconnect` i `refetchOnWindowFocus`.
- `invalidateQueries` z domyślnym `cancelRefetch: true` przerywa trwające fetche. `queryFn` nie przekazuje `signal`, więc żądania HTTP i tak są wysyłane.
- `flushCleanupQueue` sekwencyjnie woła edge dla każdego zadania, choć serwer ma cron.
- **Poprawka:** jeden koordynator z deduplikacją (pomijać, jeśli poprzedni sync był < 5 s temu); `cancelRefetch: false`; reagować tylko na `background → active`; `refetchOnWindowFocus: false` globalnie.

**DB-4 [P1, OTA, S]. Czat pobiera `thumbnail_b64` dla 50 nixów** (około 61 KB każdy, do około 3 MB na fetch) przy każdym odświeżeniu (`nixService.ts:303-327`). Pole jest potrzebne tylko w parametrach trasy viewera, a viewer i tak pobiera je sam. Usunąć z selecta i z parametrów trasy.

**DB-5 [P1, OTA S–M; Backend]. Po wysłaniu tekstu.**
- `select('*')`, refetch **wszystkich** stron czatu, paczka inboxu (6), a potem realtime unieważnia wszystko jeszcze raz.
- U odbiorcy z otwartym czatem to około 16 zapytań na jedną przychodzącą wiadomość.
- **Poprawka:** `setQueryData` (dopisanie albo zamiana po `client_message_id`), oznaczenie przeczytania łatane lokalnie.

**DB-6 [P1, Backend M–L + OTA]. Paczka inboxu: 2 fale, 6 zapytań, do 300 wierszy przy każdej invalidacji** (`inboxQuery.ts:33-46`). RPC `get_inbox_threads()` (`DISTINCT ON (peer)` + profil + unread w jednym JSON); zdarzenia realtime łatane przez `setQueryData`.

**DB-7 [P2, OTA, S].**
- Kaskada przy otwarciu czatu: `peerProfile`, potem podpisany URL. Rozwiązanie: `initialData` z paczki inboxu.
- Polling moderacji zdjęć można zakończyć zdarzeniem realtime INSERT na `nixes`, które jest już subskrybowane.
- `fetchUnreadInboxQueueFromSender` nie ma limitu i pobiera `thumbnail_b64` (`nixService.ts:197-204`).
- `captureAccountTransport` tworzy nowy `createClient` przy każdym wywołaniu (`supabase.ts:57`).

### 7.2 Backend

**DB-8 [P0, Backend, S–M]. Worker moderacji.**
- `workers/moderation/main.ts:150-161`: po każdym `tick()` jest uśpienie na 1 s, także po przetworzonym zadaniu.
- `CLAIM_LIMIT = 1`.
- `claim_moderation_jobs` działa jako FIFO bez priorytetu, więc jedno wideo (do 120 klatek przy 200 ms odstępu, czyli ≥ 24 s) blokuje wszystkie teksty.
- **Poprawka:** pętla bez uśpienia, gdy jest praca; nowa migracja z `ORDER BY (content_kind <> 'text'), next_attempt_at, created_at`; wybudzanie przez `pg_notify` zamiast odpytywania. Uwaga na limit F0 (5 RPS).

**DB-9 [P1, Backend, M]. RLS: `auth.uid()` i `private.is_account_restricted(...)` bez opakowania w `(SELECT …)`**, więc wykonują się dla każdego wiersza.
- Dotyczy: `nixes_select`, `text_messages_select/insert`, `message_reactions_*`, `friendships_*`, `conversation_*`, `profiles_*`.
- To samo w RPC `get_public_profiles_by_ids` i `list_accepted_friends_paginated`.
- **Poprawka:** nowa migracja z drop i create polityk.

**DB-10 [P2, Backend, S]. Indeksy (jedna nowa migracja).**
- **Brakujące na FK:**
  - `media_upload_recipients(nix_id)`;
  - `content_reports(nix_id)` i `(text_message_id)`;
  - `moderation_jobs(batch_id)` i `(text_payload_id)`;
  - `push_notification_jobs(recipient_id)` i `(actor_id)`;
  - `push_notification_deliveries(device_id)`;
  - `nix_capture_prefs(friend_user_id)`;
  - `friend_invites(used_by)`;
  - `upload_logs(receiver_id)`;
  - `media_upload_batches(asset_id)`;
  - `media_assets(upload_batch_id)`.
- **Pod zapytania aplikacji:**
  - `nixes(sender_id, receiver_id, created_at DESC)`;
  - częściowy `nixes(receiver_id, sender_id, created_at) WHERE status='sent' AND is_viewed IS NOT TRUE`;
  - `nixes(media_path)`.
- **Do usunięcia:** `idx_snaps_is_viewed`, `idx_snaps_receiver_id`, `idx_snaps_sender_id` (prefiksy indeksów złożonych), `message_reactions_message_id_idx`.

**DB-11 [P2, Backend, S–M]. Edge `begin-media-upload`.**
- `auth.getUser()` to dodatkowe zapytanie do GoTrue, choć `verify_jwt = true`. Zamiast tego `getClaims()` albo `sub` z JWT.
- Podpisany URL można generować równolegle z RPC.
- `esm.sh` → `npm:`.

**DB-12 [P2, Backend, M]. Push.**
- `push-dispatch` robi około 8 sekwencyjnych zapytań na zadanie.
- `materialize_approved_media_batch` wstawia nixy w pętli.
- Crony wołają edge bez warunku (co minutę i co 2 min).
- **Poprawka:** `IF EXISTS(due) THEN http_post`, `INSERT … SELECT`, RPC `prepare_push_job`.

**DB-13 [P2, Backend, S]. Awatary.** Ścieżki są niezmienne, więc można ustawić `cache-control: max-age=31536000, immutable`.

**Sprawdzone i w porządku.** `QueryClient` (`staleTime` 5 min, `gcTime` 30 min, `retry` 1) ma rozsądne ustawienia. Problemem są szerokie ręczne invalidacje, a nie wartości domyślne.

### 7.3 Budżet zapytań (stan obecny, online)

| Ścieżka | Ścieżka krytyczna (fale) | Łącznie | Cel |
|---|---|---|---|
| Start → inbox | 4 (profil i wiek **blokują splash** → paczka 5× + zaproszenia → profile → podpisy); `syncForeground` ×2 może powtórzyć falę 2 | około 11–13 + tło | 0 przed renderem (snapshot + cache), potem 1 fala RPC |
| Otwarcie czatu | 1 dla treści, 2 dla awatara | około 6 + `mark_read` + paczka (6) | 1 fala bez miniatur, cache łatany lokalnie |
| Wysyłka zdjęcia | begin (3 sekwencyjne w środku) → PUT → finalize → polling co 400 ms → materializacja → push (około 8) | 3 + N + około 12 odświeżeń | begin z 1–2 zapytaniami, koniec przez realtime, łatanie cache |
| Wysyłka tekstu | enqueue → polling (worker ≤ 1 s bezczynności + Azure + FIFO) → `select('*')` → wszystkie strony | 3–6 + 6 + około 9; **pole zablokowane** | pole wolne od razu, `setQueryData` |

---

## 8. Plan wdrożenia

**Kontekst wydania.** `docs/release/ios-current.md` mówi, że build 11 jest w przygotowaniu przed App Review, a dla runtime 1.0.12 nie było żadnego OTA. **Nie mieszać tych zmian z build 11.** Rekomendacja: osobna gałąź `perf/offline-sending` od `main` po zmergowaniu PR #56. Poprawki P0 z etapu 1 można rozważyć do builda 12. OTA tylko po potwierdzeniu właściciela (zasada 1).

### Etap 1 — szybkie poprawki JS (1–3 dni, OTA albo build 12)

| # | Zmiana | ID |
|---|---|---|
| 1 | `notifyDomainError`: kontekst zamiast `UNKNOWN`, klasyfikacja offline; 13 brakujących kluczy i18n i test pokrycia kluczy | NOTIF-1, NOTIF-2 |
| 2 | Szkic czyszczony po przejściu (brak mignięcia błędu); bez toastu „Wysłano”; `dismissTo(origin)` | SEND-1, SEND-10 |
| 3 | `retry_scheduled` jako „Ponawianie…” (neutralnie) w inboxie, czacie i Live Activity (JS) | NOTIF-10, SEND-13 |
| 4 | `settleMediaModeration`: sieć i timeout nie dają `failed`; ukrywanie zadań dopasowanych po `batchId` | OFF-2, SEND-9 |
| 5 | Odblokowanie pola tekstowego w czacie (wysyłka w tle) | DB-1, OFF-5 |
| 6 | `useMemo` na wartości `UploadQueueProvider` i na `summary`; `useMemo` w `useInboxScreen` | PERF-8 (część), PERF-9 (b) |
| 7 | Filtr `updated/success` w `OfflineCacheProvider`; flush zamiast clear; bez `force` | PERF-11, OFF-8 |
| 8 | Deduplikacja `syncForeground`, `cancelRefetch: false`, tylko `background → active` | DB-3 |
| 9 | Usunięcie realtime `message_reactions '*'` i DELETE na `text_messages` | DB-2 (JS) |
| 10 | `thumbnail_b64` usunięte z czatu i z parametrów trasy viewera | DB-4 |
| 11 | Reset backoffu outboxa przy powrocie sieci i akcja „Wyślij teraz” | OFF-3 |
| 12 | Timeout `getSession` przy zimnym starcie offline | OFF-1 |
| 13 | Stabilne klucze: `peer:${peerId}` w inboxie; `placeholderData` dla awatarów | SEND-5, SEND-6 |
| 14 | Kolejka banerów: priorytet, brak czyszczenia przy `inactive`, skończony czas przy VoiceOver | NOTIF-5, NOTIF-7 |

### Etap 2 — refaktory JS (1–2 tygodnie)

- **Upload store:** `useSyncExternalStore` z selektorami, łączenie postępu w pamięci, `toDisplayProgress`, numer sekwencji w `refresh`, czyszczenie zakończonych zadań (PERF-8, SEND-3, SEND-7).
- **Czat:** `OutgoingMediaBubble` ze stałym kluczem `media-${job.id}`, lokalny stan composera, `memo` komórek, `startRenderingFromBottom`, klawiatura przez `translateY` i worklet (SEND-8, PERF-10, PERF-14, PERF-26).
- **`connectivityStore`** z histerezą i reachability Supabase; optymistyczny auth offline (4.3).
- **Bootstrap SWR ze snapshotu**, hydracja cache w tle, cache sesji w `authStorage` (PERF-1, PERF-2, PERF-3).
- **Viewer:** seed równolegle, `Promise.all`, poster wideo, preload następnego wideo, krótsze fade'y (PERF-19 do PERF-21).
- **Nowy system banerów:** szybsze wejście i wyjście, haptyka przy przyczynie, `notifyFailure`, offline inline (5.3).
- **Wypalanie nakładek przeniesione do kolejki** (PERF-23 JS, SEND-11).
- **Outbox v2:** stany `expired` i „czeka na sieć”, `rerun`, FIFO per rozmówca (OFF-4 do OFF-7).
- **Lazy Skia i kompresor**; Sentry i css-tree poza bundlem (PERF-4, PERF-5).

### Etap 3 — backend (nowe migracje + `scripts/check-supabase-migrations.mjs`)

1. Worker moderacji: brak uśpienia, gdy jest praca; priorytet tekstu (DB-8).
2. RLS z `(SELECT auth.uid())` (DB-9).
3. Migracja indeksów (DB-10).
4. Broadcast dla reakcji i wiadomości (DB-2).
5. RPC `get_inbox_threads` (DB-6).
6. Push: warunkowe crony, `ttl`, tytuł = nadawca (DB-12, NOTIF-13).
7. Czas utworzenia NiX-a od klienta (SEND-8).

Przed migracjami RLS i indeksów uruchomić Supabase Performance Advisor (`auth_rls_initplan`, `unindexed_foreign_keys`, `duplicate_index`).

### Etap 4 — natywne (Xcode Archive, ścieżka B)

1. Throttling `didSendBodyData` i snapshoty w pamięci w `BackgroundUploadCoordinator.swift` (PERF-8, SEND-2).
2. Jedno źródło zapisu dla Live Activity i mapowanie `retry_scheduled` w Swift (SEND-2, NOTIF-10).
3. Eksport nakładek od razu w profilu docelowym (PERF-23).
4. `-O` dla targetu widgetu (PERF-28).
5. Okno banerów nad arkuszami i treść w `@expo/ui/swift-ui` (NOTIF-6).
6. Opcjonalnie `react-native-keyboard-controller` (PERF-26).
7. Ponowne włączenie React Compilera po ustaleniu przyczyny wyłączenia w 1.0.10 (PERF-9 a).

---

## 9. Testy do dodania

**Informowanie:**
- test pokrycia kluczy i18n;
- `appNotify` na prawdziwych `resources` (`new Error('x')` → tytuł z fallbacku, `TypeError('Network request failed')` → offline);
- reguła lint zakazująca `err.message` w `notify*`;
- kolejka: priorytet, wywłaszczanie, `inactive` nie czyści, ten sam klucz aktualizuje treść, skończony czas przy VoiceOver.

**Wysyłka:**
- `toDisplayProgress` jest monotoniczne;
- `prepareVideoForUpload` emituje postęp monotonicznie;
- łączenie postępu (fake timers: ≤ 8 aktualizacji na sekundę, 0 zapisów SQLite bez zmiany fazy);
- strażnik kolejności w `refresh`;
- stały klucz w czacie i inboxie;
- dopasowanie po `client_upload_id` przy różnicy zegarów;
- `paused` daje akcję `resume`;
- brak duplikatu „błąd + NiX”;
- `retry_scheduled` nie daje `failed` w Live Activity;
- logika send-to: brak `notifySuccess`, powrót do czatu, podwójne wywołanie daje jedno wstawienie, szkic czyszczony po przejściu.

**Offline:**
- zimny start z wygasłym JWT i offline → `authenticatedOffline` w ≤ 3 s;
- Stack nie jest podmieniany po `appReady`;
- outbox: `rerun`, reset backoffu, `expired`, FIFO per rozmówca, invalidacja przy błędzie;
- `settleMediaModeration` przy błędzie sieci zostawia `finalizing`;
- `OfflineCacheProvider`: 10 renderów daje 0 zapisów;
- reconnect: paczka inboxu pobrana ≤ 1 raz w ciągu 1 s;
- `connectivityStore`: flap < 2 s nic nie zmienia;
- czat offline bez cache pokazuje stan „brak danych”.

**Push:**
- wyciszanie według fokusu i `new_nix`;
- `navigate` zamiast `push`;
- rationale po pierwszej wysyłce;
- snapshot tekstów pl i en.

**Ręcznie na iPhonie (light + dark):**
- zdjęcie i wideo z nakładką;
- wysyłka z czatu;
- tryb samolotowy w połowie wysyłki;
- wolna moderacja;
- dwa wideo naraz;
- Dynamic Island;
- baner, a potem otwarcie formSheet lub ImagePicker;
- VoiceOver z dwoma komunikatami;
- Reduce Motion;
- Control Center przy widocznym błędzie.

---

## 10. Do zmierzenia na urządzeniu

Tych rzeczy nie da się ocenić z samego kodu:

- czas Keychaina na jedno `getSession()` (Instruments);
- czas od uruchomienia do schowania splasha (EAS Observe albo Instruments);
- udział `compression_skipped` względem `compression_ms` dla nagrań z kamery (PERF-22);
- `viewer_signed_url_ms` i `inbox_fetch_ms` p50/p95 przed i po zmianach;
- FPS przewijania inboxu i czatu podczas wysyłki; FPS banera Skia w trakcie przejścia nawigacji (build Release, najstarszy wspierany iPhone);
- zachowanie Realtime dla DELETE na `text_messages` (Realtime Inspector);
- czy UIKit sheet zasłania `FullWindowOverlay` (NOTIF-6);
- plany `EXPLAIN` dla zapytań czatu i unread po migracji indeksów.
