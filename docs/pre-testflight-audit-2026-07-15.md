# Audyt gotowości NiX przed TestFlight

**Data audytu:** 15 lipca 2026

**Zakres:** iOS, zewnętrzny TestFlight / Beta App Review

**Projekt Expo:** `@mt_hub/nix-app` (`c7ada746-56ff-4e91-827c-8ec2686650b8`)

**Bundle ID:** `com.damianmotylinski.nixapp`

**Wersja aplikacji:** `1.0.0`

**Werdykt:** **NO-GO**

## 1. Podsumowanie wykonawcze

NiX ma stabilny fundament techniczny i zaimplementowany lokalnie pakiet poprawek
przedwydaniowych: bramka 16+, zgłaszanie wiadomości z 30-dniową kopią dowodową,
blokady egzekwowane przez backend, kolejkę i decyzje moderacji, twardo wyłączone
Sentry SDK, spójne
purpose strings oraz bramki jakości przed ręcznym buildem. Pierwotny błąd
TypeScript został usunięty, a typecheck i lint po zmianach przechodzą.

Aplikacji nadal nie należy udostępniać zewnętrznym testerom TestFlight. Blokują ją trzy grupy warunków zewnętrznych:

1. Migracja i Edge Functions bezpieczeństwa nie zostały jeszcze wdrożone i
   przetestowane na produkcyjnym projekcie Supabase.
2. Nie istnieje podpisany produkcyjny build EAS ani wynik testów na fizycznym
   iPhonie; zgodnie z zakresem tego zadania płatnego buildu nie uruchomiono.
3. Expo MCP nadal wymaga ponownego OAuth, a publiczny URL polityki, App Privacy,
   dane reviewera i ustawienia App Store Connect wymagają ręcznego domknięcia.

### 1.1 Stan implementacji poprawek

| Obszar | Stan 15.07.2026 | Dowód |
|---|---|---|
| TypeScript / przyciski zaproszeń | ✅ wykonane | SwiftUI `Button`; `npm run typecheck` PASS |
| Bramka 16+ | ✅ kod gotowy | `ageGate.ts`, wersjonowane `age_attestations`, testy graniczne |
| Report / block | ✅ kod gotowy | viewer, ekran Bezpieczeństwo, Edge Functions i RLS/RPC |
| Moderacja | ✅ kod gotowy | prywatny bucket, `moderation-admin`, audit, SLA i runbook |
| Sentry | ⏸️ twardo wyłączone | SDK 7.11 pozostaje; runtime, Edge transport, source maps i dSYM są zablokowane |
| iOS config | ✅ wykonane | brak background modes/Face ID, EN/PL, `check:ios-config` |
| EAS workflow | ✅ wykonane | ręczne build/submit, gates i osobna aprobata człowieka |
| Polityki / review notes | ✅ repo / 🟠 publikacja ręczna | dokumenty bez placeholderów, szablon TestFlight |
| Signed EAS + device QA + Expo MCP | 🔴 niewykonane | jawne manual gates; poza zakresem automatycznych zmian |

Pozycje P0 muszą zostać zamknięte przed zewnętrznym TestFlight. Pozycje P1 powinny zostać zamknięte przed Beta App Review. P2 nie blokują pierwszego wewnętrznego buildu, ale powinny mieć właściciela i termin.

## 2. Zakres, środowisko i metoda

### 2.1 Środowisko

| Element | Stan |
|---|---|
| Expo | SDK 57, pakiet `~57.0.6` |
| React Native | `0.86.0` |
| React | `19.2.3` |
| TypeScript | `~6.0.3` |
| React Compiler | włączony |
| Expo Router | `~57.0.6` |
| Platforma | tylko iOS |
| Konto EAS | `mt_hub` |
| Profil produkcyjny | `production`, `autoIncrement: true` |
| Źródło wersji builda | zdalne (`appVersionSource: remote`) |

Źródła konfiguracji: [`package.json`](../package.json), [`app.json`](../app.json), [`eas.json`](../eas.json) i [`.eas/workflows/release.yml`](../.eas/workflows/release.yml).

### 2.2 Wykonane kontrole

| Kontrola | Polecenie | Wynik |
|---|---|---|
| React Doctor | `npx react-doctor . --json` | **100/100**, 0 diagnostyk; zmieniony zakres: 0 nowych problemów |
| Expo Doctor | `npx -y expo-doctor@latest` | **19/19 zaliczonych** |
| Zgodność zależności Expo | `npx expo install --check` | zależności aktualne dla SDK |
| TypeScript | `npm run typecheck` | **PASS po poprawkach** |
| ESLint / Expo lint | `npm run lint` | PASS |
| Testy | `npm test` | PASS, 35 plików / 194 testy |
| Martwy kod / Knip | `npm run check-knip` | PASS |
| Edge Functions | `deno check` wszystkich bieżących funkcji i modułów współdzielonych; `deno test` transportu Sentry i autoryzacji service-role | PASS |
| Migracje / baseline | świeży lokalny Supabase, `db reset`, asercje kohorty i soft rollback | PASS; 15 tabel publicznych, 2 private, 2 moderation, buckety i realtime potwierdzone |
| Eksport produkcyjny | `npm run export:production` | PASS, 2922 moduły, Hermes HBC 8,2 MB; upload source maps wyłączony |
| Audyt zależności | `npm audit --omit=dev --json` | 0 podatności |
| Walidacja workflow | `npx eas-cli@latest workflow:validate <workflow>` | PASS dla czterech workflow |
| Lista buildów EAS | `npx eas-cli@latest build:list --platform ios --json --non-interactive` | `[]` — brak buildów iOS |
| Lokalny build Release | `xcodebuild ... Release ... ARCHS=arm64 CODE_SIGNING_ALLOWED=NO build` | PASS; finalny bundle zwalidowany, bez podpisu; upload Sentry jawnie wyłączony |

Build symulatorowy arm64 nie zastępuje podpisanego archiwum urządzeniowego. Nie weryfikuje certyfikatów, profilu provisioning, uploadu do App Store Connect ani zachowania na fizycznym urządzeniu.

### 2.3 Expo MCP

Oficjalny serwer `https://mcp.expo.dev/mcp` jest dodany do konfiguracji Codex ze statusem `enabled / OAuth`. Próba inicjalizacji w tej sesji zakończyła się komunikatem:

> `OAuth authorization required`

W konsekwencji narzędzia `read_documentation`, `build_list`, `workflow_list`, `testflight_crashes` i `testflight_feedback` nie były dostępne. Stan buildów został zastępczo sprawdzony uwierzytelnionym EAS CLI, a dokumentacja — bezpośrednio w oficjalnych źródłach Expo. **Zdalny stan workflow, TestFlight crashes/feedback oraz metadane App Store Connect pozostają niezweryfikowane przez MCP i są warunkiem domknięcia audytu.**

## 3. Macierz gotowości

| Obszar | Status | Ocena |
|---|---|---|
| Build i konfiguracja Expo | 🟠 Warunkowo | konfiguracja i lokalny Release; brak podpisanego buildu EAS |
| Jakość kodu | 🟢 Dobry | typecheck i lint przechodzą; React Doctor 100/100 |
| Testy automatyczne | 🟢 Dobry | 194 testy, lint i Knip przechodzą |
| Testy urządzeń | 🔴 Blokada | brak udokumentowanego testu na fizycznym iPhonie i E2E |
| Kamera, zdjęcia i wideo | 🟠 Warunkowo | pipeline jest testowany jednostkowo; brak pełnego testu urządzeniowego i odmów uprawnień |
| Logowanie i konto | 🟢/🟠 | Apple i e-mail są dostępne; Google jest nieaktywnym stubem; usuwanie konta istnieje; brak konta reviewera |
| Prywatność i prawo | 🟠 Warunkowo | teksty spójne; pozostała publikacja URL i ASC App Privacy |
| Uprawnienia i background modes | 🟢 Dobry | EN/PL zsynchronizowane; nieużywane tryby i Face ID usunięte |
| Bezpieczeństwo zależności | 🟢 Dobry | 0 podatności produkcyjnych; secure storage i HTTPS/Supabase |
| UGC i moderacja | 🟠 Warunkowo | kod/report/block/proces gotowe; wymagane deploy i smoke produkcyjne |
| Monitoring produkcyjny | 🟠 Świadomie wyłączony | Sentry nie wysyła danych; decyzja i test przed ewentualnym uruchomieniem pozostają P1 |
| EAS Workflow | 🟢 Dobry | build ręczny po gates; submit oddzielony aprobatą i potwierdzeniem |
| App Store Connect / TestFlight | 🔴 Blokada | brak buildu i danych reviewera; zdalny stan MCP niezweryfikowany |
| iPad / dostępność urządzeń | 🟡 Do sprawdzenia | `supportsTablet: false`; brak udokumentowanego testu compatibility mode |

## 4. Wyniki techniczne

### 4.1 TypeScript — blokada usunięta

Stan początkowy zwracał:

```text
src/app/(tabs)/profile/friends.tsx(112,29): error TS2322
Property 'role' does not exist on type 'ButtonProps'.
```

Przyciski wewnątrz `HStack` zostały przeniesione do `@expo/ui/swift-ui` z
modifierami `buttonStyle('plain')` i `disabled`. Aktualny `npm run typecheck`
przechodzi. Akceptacja i odrzucenie zaproszenia pozostają do smoke testu urządzeniowego.

### 4.2 Expo Doctor

Expo Doctor zgłasza 19/19 aktywnych kontroli jako zaliczone. Wynik jest pozytywny, ale nie jest kompletnym dowodem synchronizacji konfiguracji, ponieważ w [`package.json`](../package.json) wyłączono `appConfigFieldsNotSyncedCheck`. Przy śledzonym katalogu `ios/` oznacza to, że rozbieżności `app.json` ↔ projekt natywny muszą być kontrolowane osobno.

Stwierdzone wcześniej rozbieżności zostały usunięte:

- `app.json`, bazowy Info.plist i EN/PL opisują kamerę, mikrofon i bibliotekę zgodnie z użyciem;
- pluginy `expo-audio` i `expo-video` jawnie wyłączają background playback/recording/PiP;
- `expo-background-fetch`, `expo-task-manager`, serwis foreground udający background oraz wszystkie `UIBackgroundModes` usunięto;
- `scripts/check-ios-config.mjs` blokuje powrót rozbieżności i zbędnych kluczy Face ID/local network.
- `EXUpdatesEnabled` w natywnym `Expo.plist` ma wartość `false`, mimo ustawienia obsługi bsdiff w `app.json`; OTA nie należy traktować jako aktywnego mechanizmu wydania.

### 4.3 React Doctor — 100/100 po naprawach

Wynik początkowy wynosił **61/100**: 4 błędy i 18 ostrzeżeń w 12 plikach.
Po wdrożeniu napraw pełny skan React Doctor 0.7.8 zwraca **100/100, 0 błędów
i 0 ostrzeżeń**, a skan `--scope changed --include-untracked --base main`
nie wykazuje nowych problemów.

Zamknięto wszystkie grupy diagnostyk:

- reautoryzację usuwania konta przeniesiono poza komponent i pokryto testami hasła/Apple/błędu;
- usunięto 10 ręcznych memoizacji przy aktywnym React Compiler;
- cleanup realtime i NetInfo ma bezpośredni teardown; dwa false positives mają wąskie inline suppressions z uzasadnieniem;
- hooki/konteksty wydzielono z plików providerów, zachowując granice Fast Refresh;
- asset logo rozwiązuje `expo-asset`, a formattery PL/EN powstają raz w module;
- ACK pozostaje sekwencyjny i ma test kolejności oraz maksymalnie jednej operacji równoległej;
- iteracje Edge Function zostały połączone;
- jedyny false positive `deslop/unused-export` dla wariantu platformowego bottom sheeta
  jest opisany w `doctor.config.jsonc` i wyciszony bezpośrednio przy eksporcie.

Workflow PR, preview i release uruchamia pełny skan z `--blocking warning`, więc
każda nowa widoczna diagnostyka zatrzyma bramkę.

### 4.4 Build, EAS i workflow

- `expo export` tworzy poprawny bundle Hermes iOS o rozmiarze 8,1 MB.
- Lokalny Release dla symulatora przechodzi bez podpisywania; nie jest to dowód gotowości archiwum App Store.
- `eas.json` ma prawidłowy profil produkcyjny z automatycznym numerem builda.
- `.eas/workflows/release.yml` i `preview.yml` są wyłącznie ręczne, a build zależy od przejścia typecheck, lint, testów, Knip, Expo Doctor, kontroli zależności, iOS config i eksportu Hermes.
- `.eas/workflows/lint-test.yml` wykonuje te bramki na pull requestach, w tym React Doctor dla nowych problemów.
- `.eas/workflows/testflight-submit.yml` przyjmuje ID istniejącego buildu, wymaga jawnego potwierdzenia oraz osobnej aprobaty człowieka przed submit/Beta Review. Nie tworzy buildu.
- Uwierzytelnione EAS CLI zwróciło pustą listę buildów iOS. Nie ma artefaktu, który można byłoby poddać walidacji TestFlight.

### 4.5 Uprawnienia i lokalizacja

Natywny Info.plist oraz lokalizacje EN/PL mają spójne, funkcjonalne opisy kamery, mikrofonu i biblioteki zdjęć. Nieużywany opis Face ID został usunięty. Usunięto też `fetch`, `processing` i `audio` z `UIBackgroundModes` oraz nieużywane zależności tasków tła. Pluginy audio/wideo jawnie wyłączają działanie w tle. Automatyczna kontrola `npm run check:ios-config` zabezpiecza ten stan; finalne prompty pozostają do obejrzenia na urządzeniu w obu językach.

Pozytywnie: Release usuwa deweloperskie klucze lokalnej sieci Expo Dev Launcher, a `ITSAppUsesNonExemptEncryption` ma wartość `false`.

### 4.6 Monitoring i bezpieczeństwo

Projekt zachowuje `@sentry/react-native ~7.11.0`, plugin Expo, Metro i CocoaPods,
ale Sentry jest tymczasowo twardo wyłączone. Stałe runtime aplikacji i Edge
Functions blokują wysyłkę niezależnie od DSN, root layout nie używa
`Sentry.wrap`, a EAS/Xcode mają wymuszone wyłączenie source maps i dSYM. Kontrolę
zapewnia `npm run check:sentry-disabled` oraz test z ustawionym testowym DSN.
Log lokalnego buildu Release potwierdza oba warunki komunikatami
`skipping sourcemaps upload` i `skipping debug files upload`.
Monitoring produkcyjny pozostaje otwartym P1; jego ponowne włączenie wymaga
osobnej decyzji, aktualizacji App Privacy/polityki, sekretów oraz testu PII i symbolikacji.

Pozytywne ustalenia:

- `npm audit --omit=dev` nie wykazał podatności;
- sesje korzystają z `expo-secure-store`;
- komunikacja aplikacyjna używa Supabase przez HTTPS;
- nie znaleziono płatności, subskrypcji, reklam, kryptowalut ani zewnętrznego checkoutu; reguły IAP i ATT są obecnie nieadekwatne, o ile model biznesowy nie zmieni się przed wydaniem;
- aplikacja oferuje e-mail i Sign in with Apple; Google jest ukrytym stubem i nie jest aktywnym dostawcą;
- usuwanie konta jest dostępne w aplikacji i ma serwerową Edge Function.

## 5. App Review, UGC i prywatność

### 5.1 UGC — implementacja gotowa, deploy pozostaje blokadą

Zdjęcia i filmy wysyłane między zaakceptowanymi znajomymi są treściami tworzonymi przez użytkowników. Prywatny lub efemeryczny charakter wiadomości nie wyłącza wymagań UGC. Wdrożono lokalnie:

- zgłoszenie konkretnej wiadomości przed jej efemerycznym usunięciem;
- kopię dowodową w prywatnym buckecie z 30-dniową retencją i cleanupem;
- blokadę użytkownika egzekwowaną przez RLS/RPC, listy, wysyłkę, username i QR;
- kolejkę, priorytet, statusy, signed URL 10 min, warning/suspension/ban i audit;
- ekran własnych blokad/zgłoszeń, procedurę, SLA i drogę odwoławczą;
- bramkę 16+, która nie zapisuje daty urodzenia.

Zgodnie z decyzją produktową prywatne media nie są automatycznie skanowane.
Pozostaje to jawnym ryzykiem interpretacji Apple Guideline 1.2; mitigacją są
zamknięta sieć zaakceptowanych znajomych, szybki report/block, ręczna moderacja i
retencja dowodu. Przed Beta App Review cały przepływ musi zostać wdrożony i
przetestowany na produkcyjnym Supabase.

Bramka wieku wymaga deklaracji 16+ podczas rejestracji/onboardingu, zapisuje wyłącznie wersjonowaną atestację (bez daty urodzenia), a backend blokuje konta bez aktualnej wersji polityki. Przed wysłaniem pozostaje ustalenie zgodnego ratingu wieku w App Store Connect.

### 5.2 Dokumenty prawne i App Privacy

Dokumenty w [`src/lib/legalDocuments.ts`](../src/lib/legalDocuments.ts) i `docs/legal/` mają wersję 15 lipca 2026. Opisują retencję danych, proces moderacji i odwołania, próg 16+, odbiorców i dostawców. Nie zawierają placeholderów. Przed review trzeba uzyskać akceptację prawną, opublikować dokumenty pod publicznym HTTPS URL i sprawdzić, że formularz App Privacy odzwierciedla finalny build, Supabase, Apple i Expo/EAS. Google Sign-In pozostaje nieaktywnym stubem. Sentry SDK jest obecne w binarium, lecz nie przetwarza danych.

### 5.3 Informacje dla testera i reviewera

Repozytorium zawiera gotowy szablon [`testflight-test-information.md`](testflight-test-information.md), ale dane kontaktowe i dwa rzeczywiste konta demo muszą zostać wprowadzone bezpośrednio przed review. Dla zewnętrznego TestFlight trzeba przygotować:

- aktywne konto testowe albo dwa konta pozwalające sprawdzić relację znajomych i wymianę wiadomości;
- instrukcję logowania bez wymagania dostępu do prywatnej skrzynki lub prywatnego Apple ID;
- opis cyklu wiadomości efemerycznej, kamery, wideo, screenshot guard i usuwania konta;
- dane kontaktowe osoby odpowiedzialnej za beta review;
- wyjaśnienie backendu, ewentualnych ograniczeń regionalnych i sposobu testowania moderacji;
- prawidłową kategorię, rating wieku, eksport compliance, politykę prywatności i odpowiedzi App Privacy.

## 6. Backlog naprawczy

### P0 — blokuje zewnętrzny TestFlight

| ID | Stan | Element | Dowód | Ryzyko | Rekomendowana zmiana | Właściciel | Kryterium akceptacji |
|---|---|---|---|---|---|---|---|
| P0-1 | ✅ kod / 🟠 urządzenie | Domknięcie poprawki TypeScript | SwiftUI `Button`; typecheck, lint i testy PASS | regresja akceptacji/odrzucenia zaproszeń może wystąpić tylko natywnie | wykonać smoke obu akcji na fizycznym urządzeniu | iOS / frontend | obie akcje kończą się poprawnym stanem UI/backendu bez crasha |
| P0-2 | 🟠 deploy wymagany | Uruchomienie moderacji UGC | migracja `20260715095155…`, pięć modułów Edge/shared, viewer i ekran Bezpieczeństwo | kod bez wdrożenia nie chroni testerów; automatyczne filtrowanie prywatnych mediów nie jest wykonywane | wdrożyć migrację i funkcje, ustawić sekrety moderatora/cleanup, wykonać report/block/decision/appeal smoke | backend + trust & safety + produkt | zgłoszenie zachowuje dowód 30 dni; blokada działa w RLS/API; moderator wykonuje decyzję z audit logiem w SLA |
| P0-3 | 🔴 otwarte | Brak podpisanego buildu i testu urządzeniowego | EAS `build:list` zwraca `[]`; tylko build symulatorowy | niewykryte problemy z signingiem, uprawnieniami, kamerą i wydajnością | po wdrożeniu P0-2 uruchomić jeden `eas build --platform ios --profile production` i zainstalować przez TestFlight | release / iOS QA | build EAS zakończony, przetworzony w App Store Connect i zaliczony smoke test na fizycznym iPhonie bez crashy |

### P1 — zamknąć przed Beta App Review

| ID | Stan | Element | Dowód | Ryzyko | Rekomendowana zmiana | Właściciel | Kryterium akceptacji |
|---|---|---|---|---|---|---|---|
| P1-1 | ✅ lokalnie | Bramki jakości workflow | cztery zwalidowane workflow; build zależy od joba `checks` | niezweryfikowane wykonanie w chmurze EAS | uruchomić workflow na bezpłatnym PR i potwierdzić artefakty/logi | release engineering | czerwona bramka zatrzymuje build, zielony commit dochodzi do joba build |
| P1-2 | ✅ lokalnie | Usunięcie zbędnych background modes | brak `UIBackgroundModes`, task dependencies i serwisu; jawne flagi pluginów | regresja po kolejnym prebuild | utrzymać `check:ios-config` w CI i sprawdzić zachowanie foreground/background | iOS / frontend | finalny Release plist nie ma trybów; kamera/media działają zgodnie ze specyfikacją |
| P1-3 | ✅ lokalnie | Synchronizacja app config ↔ native | `check-ios-config.mjs`, app.json, Info.plist i lokalizacje | ręczna edycja native może ominąć app config | utrzymywać test synchronizacji i wykonywać kontrolowany prebuild przy aktualizacjach Expo | iOS / release | każda rozbieżność purpose strings/trybów tła łamie workflow |
| P1-4 | ✅ lokalnie / 🟠 urządzenie | Lokalizacja purpose strings | pełne `en.lproj` i `pl.lproj`, brak Face ID | prompt może różnić się w finalnym archiwum | sprawdzić każdy prompt na urządzeniu EN/PL, również odmowę i Settings | iOS + localization | każdy prompt opisuje konkretną funkcję, brak nieużywanego Face ID |
| P1-5 | ⏸️ twardo wyłączone | Monitoring produkcyjny | SDK pozostaje, ale runtime/Edge/source maps/dSYM są zablokowane i kontrolowane w CI | brak zdalnych crashy i symbolikacji utrudni diagnozę bety | przed włączeniem podjąć osobną decyzję, zaktualizować prywatność, sekrety i wykonać test PII/symbolikacji | platform / security | do czasu decyzji testowy DSN nic nie wysyła; po decyzji zdarzenie ma release/build i symboliczny stos bez danych wrażliwych |
| P1-6 | 🟠 publikacja | Publiczne dokumenty prawne | spójne PL/EN i in-app, bez placeholderów | lokalny Markdown nie spełnia wymogu publicznego URL | zatwierdzić prawnie i opublikować publiczny HTTPS URL; dopasować App Privacy | legal / privacy | URL działa bez logowania; treść i formularz App Privacy są zgodne z finalnym buildem |
| P1-7 | 🔴 dane operacyjne | Dane ASC/reviewera | szablon TestFlight gotowy; brak bezpiecznych kont demo w repo | reviewer nie przejdzie pełnego flow | utworzyć dwa konta demo, uzupełnić kontakt, rating, App Privacy i Review Notes | product / release | reviewer z nowego urządzenia realizuje pełny scenariusz wyłącznie według instrukcji |
| P1-8 | ✅ kod / 🟠 ASC | Egzekwowanie progu wieku | deklaracja rejestracji, onboarding, `age_attestations` i blokada backendowa | rating ASC może być niespójny z polityką 16+ | po deployu wykonać testy graniczne i ustawić spójny rating | product + legal + trust & safety | konto <16 nie przechodzi; 16+ ma wersjonowaną atestację; regulamin/backend/rating są zgodne |
| P1-9 | 🔴 OAuth | Autoryzacja Expo MCP | handshake zwraca `OAuth authorization required` | brak niezależnej weryfikacji build/workflow/crashes/feedback | ponownie uwierzytelnić Expo MCP i odczytać stan projektu | release engineering | MCP `build_list` i `workflow_list` zwracają dane; po becie crashes/feedback są udokumentowane |
| P1-10 | 🟠 otwarte | Odtwarzalność lokalnej bazy | nowa migracja przechodzi na izolowanym PostgreSQL, ale `supabase start` z czystego repo zatrzymuje się na pierwszej migracji: brak wcześniejszego `prevent_username_change()` | brak pełnego testu całego łańcucha migracji i gorszy disaster recovery | dodać zatwierdzony, zanonimizowany baseline schematu sprzed `20260508104000` albo skonsolidować historię dla nowych środowisk | backend / DBA | `supabase db reset` z czystego klona przechodzi, a diff schematu względem projektu docelowego jest pusty |

### P2 — dług techniczny i rozszerzenie pokrycia

| ID | Element | Dowód | Ryzyko | Rekomendowana zmiana | Właściciel | Kryterium akceptacji |
|---|---|---|---|---|---|---|
| P2-1 | ✅ Ręczna memoizacja przy React Compiler | 10 ostrzeżeń usuniętych z `friend-scan-qr.tsx` i `useInboxScreen.ts` | zamknięte; pozostaje smoke focus/refresh na urządzeniu | utrzymać pełny React Doctor w CI | frontend | React Doctor 100/100, typecheck/lint/testy PASS |
| P2-2 | ✅ Ograniczenie kompilatora w usuwaniu konta | reautoryzacja wydzielona i przetestowana dla hasła/Apple/błędu | zamknięte automatycznie; pełny delete pozostaje do smoke | wykonać flow na fizycznym urządzeniu | frontend / auth | brak diagnostyki; testy reauth PASS |
| P2-3 | ✅ Drobne iteracje Edge Function | obie pary `filter().map()` zastąpione pojedynczym przebiegiem | zamknięte | utrzymać Deno check | backend | brak diagnostyki i Deno check PASS |
| P2-4 | Brak E2E / Maestro | brak konfiguracji E2E w repozytorium | regresje przekrojowych ścieżek media/auth/realtime | dodać Maestro dla logowania, znajomych, wysyłki, podglądu i usuwania konta; testy uprawnień na urządzeniu osobno | QA / mobile | krytyczny smoke suite działa w CI na stabilnym buildzie i raportuje artefakty |
| P2-5 | Brak testu iPada | `supportsTablet: false`, brak dowodu testowego | problemy layoutu w compatibility mode/review | wykonać smoke na iPadzie/symulatorze i udokumentować wspierany zakres | QA / design | wszystkie ekrany, modale, klawiatura i media są używalne bez ucięć i blokad |
| P2-6 | Ostrzeżenia natywnych zależności | build Xcode emituje ostrzeżenia nullability/deployment target/bundle globals | przyszłe problemy po aktualizacji Xcode/SDK | zapisać baseline i monitorować; eskalować ostrzeżenia własnego kodu, nie patchować Pods bez potrzeby | iOS | brak nowych ostrzeżeń własnego kodu; upgrade zależności ma osobny test Release |

## 7. Plan testów po naprawach

### 7.1 Automatyczne bramki przed buildem

W tej kolejności:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run check-knip
npm run check:sentry-disabled
npm run check:ios-config
npm run expo-doctor
npm run expo-install-check
npm run doctor:react:ci
npm run doctor:react:changed
npm run export:production
```

Następnie, po wdrożeniu i smoke teście P0-2, jeden podpisany `eas build --platform ios --profile production`.

### 7.2 Fizyczny iPhone

Sprawdzić co najmniej:

1. świeżą instalację oraz upgrade z poprzedniego builda;
2. Apple i e-mail login, logout, reauth i usuwanie konta; Google pozostaje poza zakresem jako stub;
3. deep link zaproszenia i skan QR;
4. kamerę przednią/tylną, torch, zdjęcie i wideo;
5. odmowę, ograniczenie i późniejsze przyznanie kamery, mikrofonu i zdjęć;
6. wybór zdjęcia i filmu, kompresję, upload, anulowanie i retry;
7. realtime, offline, zmianę sieci i resume z background;
8. podgląd efemeryczny, ACK, cleanup i screenshot guard;
9. report, block i pełny przepływ moderacji po wdrożeniu P0-2;
10. testowy DSN nie aktywuje wysyłki Sentry; błędy pozostają widoczne lokalnie w logach.

### 7.3 Zewnętrzny TestFlight

- Reviewer otrzymuje działające dane logowania i instrukcję pełnego flow.
- Publiczny URL privacy policy działa bez logowania.
- App Privacy, age rating i eksport compliance odpowiadają finalnemu buildowi.
- Purpose strings są poprawne w EN i PL.
- Pierwsza grupa zewnętrzna wykonuje smoke na co najmniej dwóch generacjach iPhone'a; oddzielnie wykonany jest test iPada compatibility mode.
- Po 24–48 godzinach sprawdzane są TestFlight crashes i feedback przez Expo MCP/App Store Connect.

## 8. Kryteria zmiany werdyktu na GO

Status może zmienić się z **NO-GO** na **GO dla zewnętrznego TestFlight** dopiero, gdy:

- [x] P0-1 jest zamknięte lokalnie; pozostaje smoke urządzeniowy przy zaproszeniach.
- [ ] P0-2 jest wdrożone i przetestowane na docelowym Supabase.
- [ ] P0-3: podpisany build i test urządzeniowy są zamknięte z dowodami.
- [x] Typecheck, lint, 194 testy, Knip, Expo Doctor i eksport produkcyjny przechodzą w jednym stanie repozytorium.
- [x] Workflow blokuje build przy czerwonej bramce jakości i wymaga ręcznego uruchomienia.
- [x] Źródłowy Info.plist nie deklaruje background modes, a purpose strings EN/PL przechodzą kontrolę synchronizacji.
- [ ] Publiczna polityka prywatności działa pod HTTPS URL i odpowiada App Privacy (lokalne dokumenty są gotowe).
- [ ] Działa monitoring produkcyjny bez wysyłania treści wiadomości i danych wrażliwych.
- [ ] Konto reviewera i Review Notes pozwalają odtworzyć cały główny scenariusz.
- [ ] Podpisany build EAS jest przetworzony przez App Store Connect i przechodzi smoke na fizycznym iPhonie.
- [ ] Expo MCP jest ponownie uwierzytelniony, a build/workflow/TestFlight zostały zdalnie zweryfikowane.

## 9. Źródła oficjalne

- [Expo MCP — konfiguracja, OAuth i dostępne narzędzia](https://docs.expo.dev/mcp/) — sprawdzono 15 lipca 2026.
- [Expo — Create your first build](https://docs.expo.dev/build/setup/) — wymagania EAS Build i podpisywania.
- [Expo — Submit to the Apple App Store](https://docs.expo.dev/submit/ios/) — wymagania EAS Submit.
- [Expo — EAS Workflows pre-packaged jobs](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/) — joby build/test/submit/TestFlight.
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — w szczególności 1.2 UGC, 2.1 completeness, 2.5.4 background services, 4.8 login i 5.1 privacy.
- [Apple — Provide test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information/) — dane wymagane dla zewnętrznych testerów.
- [Apple — App Privacy details](https://developer.apple.com/help/app-store-connect/manage-app-privacy/overview-of-app-privacy-details/) — zakres deklaracji danych, w tym praktyki partnerów zewnętrznych.

## 10. Ograniczenia audytu

- Nie uruchomiono płatnego ani podpisanego produkcyjnego buildu EAS.
- Nie wysłano aplikacji do App Store Connect/TestFlight.
- Nie wykonywano testów na fizycznym urządzeniu ani na koncie reviewera.
- Expo MCP był skonfigurowany, ale jego zdalne narzędzia nie przeszły inicjalizacji bez ponownego OAuth.
- Nowa migracja przeszła walidację składni i uprawnień na izolowanym PostgreSQL. Pełny `supabase start` z czystej historii jest blokowany przez starszy brak baseline'u opisany jako P1-10.
- App Store Connect, certyfikaty, provisioning, App Privacy, rating wieku, crash data i feedback pozostają do potwierdzenia po pierwszym buildzie.
- Audyt jest oceną techniczną zgodności i gotowości, a nie poradą prawną.
