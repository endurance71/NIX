# NiX — kompleksowy audyt App Store Review

**Data audytu:** 2026-08-26
**Zakres:** aktualny kod aplikacji iOS `1.0.11`, build `3`, backend Supabase, publiczne strony prawne i lokalne materiały App Store Connect
**Podstawa:** Apple App Review Guidelines po aktualizacji z 8 czerwca 2026 r.
**Werdykt:** **NO-GO do App Review**

## 1. Podsumowanie zarządcze

NiX ma solidną bazę techniczną: kompilowalny bundle produkcyjny, poprawnie opisane
uprawnienia, Sign in with Apple, usuwanie konta w aplikacji, prywatne wiadomości tylko
między zaakceptowanymi znajomymi, blokowanie, zgłoszenia, publiczny kontakt, brak reklam,
brak trackingu i brak IAP w aktualnym binary. Automatyczne testy oraz większość kontroli
release przeszły pomyślnie.

Wysłanie obecnego kandydata do review jest jednak zbyt ryzykowne. Audyt wykrył cztery
blokery produktowo-techniczne oraz nierozliczone bramki operacyjne:

1. endpoint zgłoszeń tekstu może pobrać treść dowolnej wiadomości wskazanej UUID-em,
   ponieważ używa `service_role` bez sprawdzenia, czy zgłaszający jest uczestnikiem rozmowy;
2. dowody tekstowe nie dostają `evidence_expires_at`, więc deklarowane 30 dni retencji
   nie jest egzekwowane i pliki mogą pozostać w Storage bezterminowo;
3. media UGC nie mają żadnej metody filtrowania przed wysłaniem, podczas gdy Guideline
   1.2 wymaga metody filtrowania objectionable material; istniejące report/block i ręczna
   moderacja nie zastępują tego osobnego wymagania;
4. usunięcie konta Apple usuwa użytkownika z Supabase, ale nie ma implementacji odwołania
   tokenów Sign in with Apple przez Apple REST API.

Dodatkowo nie ma dowodu, że produkcyjny backend i cron moderacji odpowiadają dokładnie
audytowanemu kodowi, a dane demo, kontakt telefoniczny, screenshoty i smoke testy pozostają
oznaczone jako `MANUAL GATE`. Dopóki wszystkie blokery i bramki P0 nie zostaną zamknięte,
status pozostaje **NO-GO**.

## 2. Skala priorytetów

| Priorytet | Znaczenie | Decyzja |
| --- | --- | --- |
| P0 | prawdopodobne odrzucenie, naruszenie bezpieczeństwa/prywatności albo brak możliwości review | naprawić i zweryfikować przed uploadem |
| P1 | istotne ryzyko review lub jakości releasu | zamknąć przed submission, chyba że świadomie udokumentowano wyjątek |
| P2 | hardening i jakość, mało prawdopodobny samodzielny powód odrzucenia | zaplanować przed lub tuż po releasie |
| OK | sprawdzone i zgodne w badanym zakresie | utrzymać test regresji |
| MANUAL | stan zewnętrzny nieweryfikowalny z repozytorium | operator musi dostarczyć dowód |

## 3. P0 — blokery wydania

### P0-1. Brak autoryzacji dostępu do zgłaszanej wiadomości tekstowej

**Reguły:** 1.6 Data Security, 5.1 Privacy.
**Dowód:** `supabase/functions/report-content/index.ts:53-62` i `:78-106`.

Funkcja uwierzytelnia użytkownika, ale następnie klientem `service_role` pobiera
`text_messages` wyłącznie po `payload.textMessageId`. Nie sprawdza, czy `auth.uid()` jest
`sender_id` albo `receiver_id`. RPC `create_content_report` nie otrzymuje ID wiadomości
tekstowej; w gałęzi user-report sprawdza tylko, czy wskazany profil istnieje i nie jest
zgłaszającym (`20260715095155_add_safety_moderation_and_age_gate.sql:390-395`).

Skutek: uwierzytelniony użytkownik posiadający UUID cudzej wiadomości może spowodować
skopiowanie jej treści, nadawcy i odbiorcy do `moderation-evidence`. UUID nie jest kontrolą
dostępu. Atak działa również przy łączeniu własnego poprawnego `nixId` z cudzym
`textMessageId`, ponieważ oba pola mogą być przesłane jednocześnie.

**Wymagana naprawa:**

- dodać tekstową wiadomość jako pełnoprawny, jednoznaczny target raportu w SQL;
- wykonać atomową kontrolę `receiver_id = auth.uid()` (ewentualnie dokładnie opisaną
  politykę dla własnych wiadomości), ustalić nadawcę po stronie serwera i dopiero wtedy
  utworzyć raport oraz kopię dowodu;
- wymusić dokładnie jeden target: `nixId XOR textMessageId XOR reportedUserId`;
- dodać test negatywny: użytkownik C nie może zgłosić ani skopiować tekstu A→B;
- nie używać wiedzy o UUID jako mechanizmu autoryzacji.

**Kryterium zamknięcia:** test integracyjny na trzech kontach zwraca 403/bez dowodu dla C,
a prawidłowy odbiorca B tworzy dokładnie jeden raport i jedną kopię dowodu.

### P0-2. Dowody tekstowe nie podlegają deklarowanemu 30-dniowemu cleanupowi

**Reguły:** 5.1.1 Privacy Policy, 1.6 Data Security.
**Dowód:** migracja `20260715095155_add_safety_moderation_and_age_gate.sql:402-414`,
`report-content/index.ts:94-106`, `cleanup-moderation-evidence/index.ts:21-27`.

SQL ustawia `evidence_expires_at = NULL`, gdy `p_nix_id IS NULL`. Raport tekstowy zawsze
wchodzi tą drogą. Edge Function zapisuje `evidence_path`, ale nie ustawia terminu ważności.
Cleanup wybiera wyłącznie rekordy z `evidence_expires_at <= now`; `NULL` nigdy nie spełnia
warunku. Późniejsze usunięcie rekordu raportu nie usuwa automatycznie obiektu Storage.

Jednocześnie polityka publiczna i in-app obiecują usunięcie kopii tekstu i mediów po 30
dniach. To materialna rozbieżność między deklaracją a zachowaniem systemu.

**Wymagana naprawa:** ustawić 30-dniowy termin dla każdego dowodu, wykonać backfill dla
istniejących rekordów, usunąć osierocone obiekty Storage, dodać test cleanupu dla tekstu
oraz monitoring `evidence_path IS NOT NULL AND evidence_expires_at IS NULL`.

**Kryterium zamknięcia:** zaplanowany cleanup usuwa testowy JSON i zeruje ścieżkę, a zapytanie
o dowody bez terminu zwraca zero.

### P0-1/P0-2 resolved (kod, 2026-08-26)

Kod i testy zamykają oba blokery w gałęzi `codex/fix-report-security-retention`.
Werdykt aplikacji pozostaje **NO-GO** (P0-3, P0-4, P0-5 otwarte).

| Pole | Wartość |
| --- | --- |
| Data | 2026-08-26 |
| Gałąź | `codex/fix-report-security-retention` |
| Expand | `20260826120000_content_report_text_target_and_evidence_retention.sql` |
| Contract | `20260827120000_drop_create_content_report_v1.sql` (produkcja: po smoke) |
| RPC | `create_content_report_v2`; Edge `report-content` nie czyta `text_messages` przed RPC |
| Testy | pgTAP A/B/C w `supabase/tests/content_report_v2_test.sql`; Deno 13/13; Vitest 71 plików / 387 testów (w tym `safetyService.test.ts`) |
| Commit | `3538f25e7805876a5514e38d83aee1b0835a2121` |

Produkcyjny dry-run, `db push` expand, deploy funkcji, smoke A/B/C, contract i
cleanup pozostają bramką operatora (`MANUAL`). Nie przywracać v1.

### P0-3. Niepełna ochrona UGC względem Guideline 1.2

**Reguła:** 1.2 User-Generated Content.
**Dowód:** `src/lib/contentSafetyFilter.ts:8-37`, publiczna polityka i review notes wprost
stwierdzają, że zdjęcia i wideo nie są skanowane automatycznie.

NiX spełnia trzy z czterech elementów 1.2: zgłaszanie, blokowanie i opublikowany kontakt.
Ma również ograniczony filtr tekstu. Brakuje jednak metody filtrowania objectionable
material dla zdjęć i wideo przed wysłaniem. Filtr tekstu obejmuje niewielką listę dokładnych
fraz i jest łatwy do obejścia wariantami pisowni, spacjami lub innymi językami.

Prywatny model accepted-friends-only ogranicza ekspozycję, ale Apple nie wyłącza komunikatorów
1:1 z wymagań bezpieczeństwa UGC. Po zmianie zasad z czerwca 2026 r. Apple dodatkowo
podkreśla odpowiedzialność dewelopera za usuwanie treści naruszających zasady.

**Wymagana decyzja produktowa:** przed submission wdrożyć realną warstwę pre-send/pre-delivery
moderation dla mediów i tekstu, najlepiej po stronie backendu, z fail-closed dla treści
wysokiego ryzyka, kolejką human review i procesem szybkiego removal. Jeżeli zamiast
automatycznej analizy zostanie wybrany inny mechanizm filtrowania, musi być technicznie
skuteczny, opisany reviewerowi i zweryfikowany na rzeczywistym buildzie — sama możliwość
zgłoszenia po doręczeniu nie jest filtrowaniem przed publikacją.

**Kryterium zamknięcia:** udokumentowany test blokuje zestaw prób wysokiego ryzyka przed
doręczeniem, a moderator może odnaleźć i usunąć treść oraz zastosować sankcję w SLA.

### P0-4. Brak odwołania tokenów Sign in with Apple przy usuwaniu konta

**Reguła:** 5.1.1(v) Account Sign-In oraz oficjalna instrukcja Account Deletion.
**Dowód:** `src/app/(tabs)/profile/delete-account.tsx:54-70` i
`supabase/functions/delete-account/index.ts:64-96`.

Flow jest łatwy do znalezienia, wymaga sensownej reautoryzacji i usuwa konto Supabase oraz
dane aplikacji. Nie ma jednak wywołania Apple REST API `revoke` dla użytkownika logującego
się przez Apple. Ponowny login Apple służy jedynie do reautoryzacji w Supabase; kod nie
pozyskuje i nie przekazuje `authorizationCode` do backendu w celu odwołania.

**Wymagana naprawa:** podczas potwierdzania usunięcia pozyskać świeży authorization code,
bezpiecznie wymienić/odwołać token po stronie serwera zgodnie z dokumentacją Apple, obsłużyć
idempotencję i dopiero potem zakończyć usuwanie. Sekrety Apple pozostają wyłącznie na
backendzie.

**Kryterium zamknięcia:** konto Apple zostaje odłączone w teście sandbox, ponowne użycie
starego tokenu nie działa, a awaria revoke ma kontrolowaną, ponawialną ścieżkę.

### P0-5. Niezamknięte bramki App Review i środowiska produkcyjnego

**Reguły:** Before You Submit, 2.1 App Completeness, 2.3 Accurate Metadata.

`docs/testflight-test-information.md` nadal zawiera placeholdery dwóch kont demo, telefonu,
nazwiska kontaktowego i screenshotów. Nie da się też potwierdzić z repozytorium:

- czy audytowane migracje i funkcje są wdrożone w produkcyjnym Supabase;
- czy cron cleanupu i kolejka moderatora są aktywne;
- czy App Privacy oraz rating 16+ zostały opublikowane w ASC;
- czy podpisany Archive ma `aps-environment=production`;
- czy backend pozostanie dostępny przez cały review;
- czy build przeszedł smoke na fizycznym iPhonie i w iPhone compatibility mode na iPadzie.

**Kryterium zamknięcia:** komplet dowodów z checklisty w sekcji 11, dwa działające konta
reviewera i pełna ścieżka A↔B wykonana na czystej instalacji bez dostępu do prywatnej skrzynki.

## 4. P1 — wysokie ryzyka

### P1-1. Publiczna polityka prywatności jest uboższa od wersji in-app

Publiczne strony zawierają administratora, zakres danych, cele, odbiorców, retencję,
kontakt i usuwanie konta. Nie opisują jednak równie jasno jak lokalna pełna polityka:

- sposobu wycofania opcjonalnej zgody na analitykę w Profilu;
- pełnego katalogu praw użytkownika (szczególnie wersja EN);
- mechanizmów transferu poza EOG;
- szczegółów push i danych zawartych w powiadomieniu.

Guideline 5.1.1 wymaga jasnego opisu wycofania zgody i żądania usunięcia. Publiczny URL w
ASC powinien być kanoniczną, pełną wersją zgodną z ekranem in-app i faktycznym backendem.

### P1-2. Deklaracja App Privacy dla Product Interaction wymaga korekty przed włączeniem analityki

`record_product_analytics_event` działa w sesji uwierzytelnionej i zapisuje
`installation_id`. Ten sam identyfikator jest łączony z kontem w tabelach instalacji/push.
W takim modelu Product Interaction jest technicznie linkowalne z użytkownikiem, mimo że
tabela zdarzeń nie zapisuje bezpośrednio `user_id`. Dokument ASC obecnie proponuje
`Product Interaction → Linked: No`.

W aktualnym kandydacie flaga roadmapy/analityki jest wyłączona, więc problem nie oznacza,
że binary obecnie wysyła zdarzenia. Przed aktywacją funkcji należy albo anonimizować i
odseparować identyfikator nieodwracalnie, albo zadeklarować Product Interaction jako linked.

### P1-3. Angielska lokalizacja jest niepełna

Aplikacja deklaruje PL i EN, lecz istotne ścieżki nadal zawierają twardo wpisany polski
tekst. Przykłady:

- `src/widgets/UploadStatusActivity.tsx:50-76` — cały Live Activity;
- `src/app/preview.tsx:427`, `:611-626`, `:667-711`, `:798-833`, `:956-1006`;
- `src/components/camera/CameraCaptureSurface.tsx:204-291` — etykiety VoiceOver;
- `src/app/friend-scan-qr.tsx:95-212` — błędy i permission rationale;
- `src/components/viewer/ViewerScreenSurface.tsx:118-170`;
- liczne błędy domenowe w `mediaService`, `friendService`, `nixService` i upload queue.

Na urządzeniu EN użytkownik może dostać mieszany interfejs i polskie komunikaty błędów.
To istotne dla planowanej dystrybucji zagranicznej oraz oceny jakości z Guideline 4.

### P1-4. Logowanie produkcyjne może ujawniać lokalne URI i dane diagnostyczne

Telemetria z `src/lib/telemetry.ts` jest ograniczona do developmentu, ale wiele
`console.warn/error/info` działa bez osłony `__DEV__`. Szczególnie:

- `src/app/preview.tsx:912` loguje pełne `photoUri`;
- `src/services/mediaService.ts:246` i `:454` logują końcówkę URI;
- upload queue loguje job IDs i fazy wysyłki;
- `uploadLiveActivity.ts` używa `console.info` w kodzie produkcyjnym.

Logi urządzenia nie są automatycznie „collected” przez NiX, ale pełne ścieżki lokalne mogą
zawierać identyfikatory/nazwy plików. Przed release należy usunąć pełne URI, zredagować
identyfikatory i wprowadzić jeden logger z poziomami oraz build-time strippingiem.

### P1-5. Fallback Sign in with Apple usuwa ochronę nonce

`src/services/socialAuthService.ts:72-85` po błędzie zawierającym słowa `nonce mismatch`
ponawia `signInWithIdToken` bez nonce. To osłabia cel wygenerowanego nonce i ochronę przed
replay. Należy naprawić konfigurację nonce między Apple i Supabase oraz traktować mismatch
jako błąd, nie jako sygnał do wyłączenia weryfikacji.

### P1-6. Brak kompletnej, wersjonowanej paczki metadata App Store

Repozytorium ma dobre Test Information, App Privacy i Age Rating, ale nie znaleziono
kanonicznego zestawu nazwa/subtitle/description/keywords/category/What's New dla PL i EN.
Nie można więc porównać rzeczywistych pól ASC z funkcjami binary ani automatycznie wykryć
obiecywania przyszłego NiX Circle. Aktualny binary nie ma RevenueCat/StoreKit i metadata
nie może jeszcze promować subskrypcji, triala ani limitu Free.

## 5. P2 — usprawnienia i hardening

1. **Filtr tekstu:** rozszerzyć testy o obfuskację, leetspeak, Unicode, wielojęzyczność,
   linki skrócone oraz false positives; źródłem prawdy powinien być backend.
2. **Moderator UX:** obecna administracja opiera się na chronionym HTTP API. Dodać bezpieczny
   panel/kolejkę z audytem, removal content, eskalacją i pomiarem SLA.
3. **App icon:** źródłowe PNG są RGBA, ale wszystkie piksele alfa są 255 (brak faktycznej
   przezroczystości). Mimo to zawsze sprawdzić wynik skompilowanego asset catalog i upload
   validation, nie tylko plik źródłowy.
4. **Sentry:** SDK jest linkowane do binary, choć runtime jest twardo wyłączony. Utrzymać
   test blokujący inicjalizację, envelope i upload symboli; rozważyć usunięcie SDK z
   publicznego Release, jeśli nie jest planowane.
5. **OTA:** proces dopuszcza OTA dla JS/assets. Nie używać OTA do dodawania istotnej nowej
   funkcjonalności, ukrytych feature flags lub zmian modelu biznesowego bez review; RevenueCat
   wymaga nowego native binary.
6. **Accessibility:** statycznie widać wiele labeli i stanów, ale wymagany jest ręczny smoke
   VoiceOver, Dynamic Type, kontrast, Reduce Motion oraz obsługa klawiatury. Twardo wpisane
   polskie etykiety VoiceOver należy objąć i18n.
7. **IPv6-only:** brak dowodu testowego; dodać test przez macOS Internet Sharing/NAT64.

## 6. Elementy ocenione pozytywnie

| Obszar | Ocena | Dowód |
| --- | --- | --- |
| Model biznesowy aktualnego binary | OK | brak RevenueCat, StoreKit, IAP, reklam i zewnętrznych płatności; dokumentacja wyraźnie oddziela przyszły model |
| Logowanie | OK z P1 nonce | własny email/password + natywny Sign in with Apple; oficjalny przycisk Apple |
| Usuwanie konta | częściowo OK | łatwo dostępne w Profilu, reautoryzacja, usunięcie Auth/danych/Storage; brak Apple revoke jest P0 |
| Uprawnienia | OK | szczegółowe purpose strings dla kamery, mikrofonu, odczytu i zapisu Photos; użycie odpowiada funkcjom |
| Transport | OK statycznie | ATS arbitrary loads wyłączone; HTTPS dla Supabase i stron prawnych |
| Sekrety | OK w badanym zakresie | service role/sekrety moderacji po stronie funkcji; brak sekretów w `EXPO_PUBLIC_*` |
| Sesja klienta | OK | tokeny Supabase przechowywane w SecureStore, z migracją ze starego storage |
| Blokowanie | OK | dostępne z viewer/chat/inbox, egzekwowane także w backendzie/push |
| Zgłaszanie | UX OK, backend P0 | konkretna wiadomość, powody, status w Profile → Safety; błąd autoryzacji tekstu opisany wyżej |
| Kontakt | OK | publiczny support i email w aplikacji/WWW |
| Age gate | OK statycznie | próg 16+, deklaracja wieku bez przechowywania DOB, wersjonowana atestacja |
| Age Rating docs | zasadniczo OK | Messaging and Chat = Yes, 16+ override, not Kids; UGC warto potwierdzić według definicji ASC „broad distribution” |
| Push | OK statycznie | treść transakcyjna, bez zdjęć/filmów/tekstu wiadomości; preferencje i wyłączenie per urządzenie |
| Background/Live Activity | OK statycznie | służą wyłącznie ukończeniu uploadu; Live Activity dotyczy postępu wysyłki |
| Privacy manifest | OK z P1 analytics | tracking false, siedem kategorii danych, required-reason APIs opisane |
| Publiczne URL-e | OK dostępność | privacy/terms/support PL/EN oraz AASA zwracają 200 dla Safari; invite links ograniczone do `/invite/*` |
| Ikony | OK statycznie | 1024×1024, brak faktycznie przezroczystych pikseli |
| Orientation/iPad | zgodne z deklaracją | iPhone portrait, `supportsTablet=false`; ręczny iPad compatibility smoke nadal wymagany |

## 7. Safety i UGC — macierz zgodności z 1.2

| Wymóg Apple | Stan | Ocena |
| --- | --- | --- |
| filtrowanie objectionable material przed posted | ograniczone frazy tekstowe; brak mediów | **P0 niespełnione** |
| report offensive content | viewer i chat, raport konkretnej treści | UX spełniony; backend ma P0 auth |
| timely response | runbook: critical 2 h/12 h, normal 24 h/72 h | MANUAL — brak dowodu dyżuru i metryk |
| block abusive users | viewer/chat/inbox + lista unblock | spełnione statycznie |
| published contact | app + support URL + email | spełnione |
| removal i plan poprawy | decyzje warning/suspend/ban; brak jawnego uniwersalnego removal dla każdego typu | P1/P0 operacyjne |

## 8. Performance i binary

- `expo export --platform ios` dla profilu produkcyjnego zakończył się sukcesem; bundle
  Hermes ma około 8,8 MB.
- TypeScript, ESLint, Knip, Expo Doctor i dependency compatibility nie wykryły błędów.
- iOS deployment target w projekcie to 16.4; `LSMinimumSystemVersion=12.0` w Info.plist nie
  jest kanonicznym ustawieniem iOS, ale warto potwierdzić finalne minimum na stronie buildu ASC.
- `aps-environment=development` w pliku repozytorium jest normalne dla developmentu tylko
  pod warunkiem, że podpisany Archive dystrybucyjny ma `production`. To bramka manualna.
- Background modes `fetch` i `processing` mają rzeczywiste użycie w durable upload/recovery;
  nie są zadeklarowane wyłącznie „na zapas”.
- Live Activity dotyczy trwającego uploadu i jest powiązane z funkcją aplikacji, zgodnie z
  2.5.16; nie wolno używać jej do marketingu lub unsolicited messaging.

## 9. Business i przyszła monetyzacja

Aktualny binary nie zawiera SDK RevenueCat, produktów StoreKit, paywalla ani zakupów.
Dokumenty ASC poprawnie mają deklarować brak IAP. Pakiet `docs/monetization/` jest wyłącznie
specyfikacją przyszłego etapu i nie może być użyty w metadata aktualnej wersji jako opis
dostępnej funkcji.

Przy przyszłym releasie NiX Circle trzeba ponownie wykonać pełny audyt sekcji 3.1:

- auto-renewable subscriptions w App Store Connect;
- cena i trial pobierane lokalnie ze StoreKit/RevenueCat;
- pełne disclosure czasu, ceny po trialu, auto-renewal i anulowania;
- Restore Purchases oraz zarządzanie subskrypcją;
- aktualizacja App Privacy o Purchases i danych RevenueCat;
- Terms/Privacy/Review Notes zgodne z faktycznym sponsored partner access;
- aktywny produkt IAP widoczny i możliwy do przetestowania przez reviewera.

## 10. Wyniki automatycznej walidacji

| Kontrola | Wynik |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --reporter=dot` | PASS — 72 pliki, 395 testów |
| `npm run check-knip` | PASS |
| `npm run expo-doctor` | PASS — 20/20 |
| `npm run expo-install-check` | PASS |
| `npm run check:ios-config` | PASS |
| `npm run check:sentry-disabled` | PASS |
| `npm run check:internal-testflight-config` | PASS |
| `npm run check:text-outbox-security` | PASS |
| `npm run check:invite-hosting` | PASS lokalny + publiczne URL-e sprawdzone osobno |
| `npm run deno:check` | PASS |
| `npm run deno:test` | PASS — 8 testów |
| `npm run check:cleanup-nix-contract` | PASS |
| `npm run check:supabase-migrations` | PASS kontroli statycznej |
| `npm run export:production` | PASS |
| `xcodebuild` Release dla unsigned iOS Simulator | INCONCLUSIVE — przerwano podczas długiej kompilacji zależności dla dwóch architektur; wcześniej nie wystąpił błąd kodu aplikacji |
| `npm run check:media-storage-integrity` | NOT RUN — wymagany `SUPABASE_DB_URL` |
| `npm run check:supabase-db-lint` | NOT RUN — lokalny Supabase/Docker nie działa na `127.0.0.1:54322` |
| pełny signed Archive + upload validation | MANUAL |
| fizyczny iPhone/iPad/VoiceOver/IPv6 smoke | MANUAL |

Uwaga: przejście istniejących testów nie obejmuje wykrytych P0. W szczególności nie ma testu
autoryzacji `report-content` na trzech użytkownikach ani testu retencji JSON evidence.

## 11. Checklista naprawcza przed ponowną decyzją GO

### Kod i backend — obowiązkowe

- [x] Naprawiono autoryzację raportów tekstowych i XOR targetów.
- [x] Dodano testy A/B/C dla zgłoszeń i prób podmiany UUID.
- [x] Wszystkie dowody mają 30-dniowe `evidence_expires_at`; backfill i cleanup sierot są w migracji/funkcji (produkcja: MANUAL).
- [ ] Wdrożono skuteczny mechanizm filtrowania tekstu i mediów zgodny z 1.2.
- [ ] Moderator może usunąć treść, zablokować konto, rozpatrzyć appeal i zachować audyt.
- [ ] Sign in with Apple revoke działa przed zakończeniem usuwania konta.
- [ ] Usunięto fallback logowania Apple bez nonce.
- [ ] Publiczna i in-app Privacy Policy są identyczne merytorycznie i zgodne z kodem.
- [ ] Uzupełniono angielską lokalizację wszystkich flow i Live Activity.
- [ ] Usunięto pełne URI i wrażliwe dane z logów Release.

### Produkcja i operacje — obowiązkowe

- [ ] `supabase migration list --linked` zgadza się z repozytorium.
- [ ] Wszystkie Edge Functions wdrożono z właściwą weryfikacją JWT/sekretów.
- [ ] Cron cleanupu i alert na dowody bez expiry są aktywne.
- [ ] Wykonano `check:media-storage-integrity` na produkcji i DB lint.
- [ ] Przeprowadzono smoke report/block/decision/removal/appeal/cleanup.
- [ ] Wyznaczono właściciela moderacji i dyżur zgodny z deklarowanym SLA.
- [ ] Backend, email confirmation, deep links i support będą aktywne podczas review.

### App Store Connect i urządzenia — obowiązkowe

- [ ] Dwa konta demo działają na czystym urządzeniu i są już zaakceptowanymi znajomymi.
- [ ] Reviewer ma oba loginy, hasła, username i prostą instrukcję pełnego flow.
- [ ] Uzupełniono imię, nazwisko, telefon i email kontaktowy.
- [ ] App Privacy opublikowano zgodnie z finalnym binary.
- [ ] Age Rating zapisano; Messaging = Yes, 16+ override, not Kids.
- [ ] Screenshoty 6.9" pokazują aplikację w użyciu i fikcyjne dane.
- [ ] Description, subtitle, keywords, category i What's New nie obiecują NiX Circle.
- [ ] Signed Archive ma production APS entitlement i poprawne app-group/associated domains.
- [ ] Testy: clean install, upgrade, offline, NAT64/IPv6, denial permissions, background upload,
  push, Live Activity, account deletion, Light/Dark, Dynamic Type, VoiceOver i iPad compatibility.
- [ ] W ASC wybrano dokładnie build, który przeszedł powyższe testy.

## 12. Proponowane Review Notes po zamknięciu P0

Nie należy wysyłać obecnych notatek przed wdrożeniem poprawek. Po ich zamknięciu użyć
krótkiej, prawdziwej wersji o następującej strukturze:

> NiX is a private 1:1 messenger for accepted friends aged 16+. Please use the two demo
> accounts in Review Information; they are already connected. Send a text, photo and short
> video from account A, then open them on account B. Safety controls are available from the
> message menu: Report and Block. Text and media are screened before delivery, reports are
> reviewed by our moderation team, and report evidence is deleted after 30 days. Account
> deletion is available at Profile → Account → Delete account and includes Sign in with Apple
> token revocation. Push notifications and the upload Live Activity are optional. There are
> no purchases, subscriptions, ads or tracking in this build.

Opis filtrowania musi odpowiadać wdrożonej technologii. Jeśli poprawka nie obejmie mediów,
nie wolno wkleić powyższej deklaracji — status pozostaje NO-GO.

## 13. Źródła Apple

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) —
  szczególnie 1.2, 1.6, 2.1, 2.3, 2.5.4, 2.5.16, 4.8 i 5.1.
- [Apple — aktualizacja zasad z 8 czerwca 2026](https://developer.apple.com/news/?id=a233fmpw)
- [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
- [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)

## 14. Ograniczenia audytu

Audyt objął repozytorium i publicznie dostępne strony. Nie miał dostępu do panelu App Store
Connect, Apple Developer Portal, produkcyjnej bazy Supabase, sekretów, logów moderatora,
podpisanego IPA ani fizycznego urządzenia. Elementy oznaczone `MANUAL` są warunkami, a nie
potwierdzonymi defektami. Audyt nie jest opinią prawną; zgodność RODO i praw konsumenckich
na wszystkich rynkach powinna zostać zatwierdzona przez właściwego doradcę.
