# Audyt incydentu: czarny ekran w viewerze zdjęć i wideo

Data audytu: 2026-07-29
Zakres: aplikacja iOS 1.0.5 / runtime 1.0.5, viewer mediów, ochrona przechwytywania ekranu, produkcyjne dane i logi Storage, wdrożone Edge Functions.
Tryb: read-only — bez zmian w kodzie aplikacji, danych i wdrożeniach.

## 1. Executive summary

Incydent nie ma jednej przyczyny. W produkcji występują dwa niezależne defekty, które prowadzą do bardzo podobnego czarnego ekranu:

1. **Critical — wdrożony `cleanup-nix-due` przedwcześnie usuwa współdzielone media.** To bezpośrednio wyjaśnia czarne zdjęcie Patrycji bez postępu oraz co najmniej jedno wcześniejsze wideo. Upload był prawidłowy, ale obiekt został skasowany przez cleanup innego odbiorcy przed otwarciem przez Patrycję. Szczegóły: §5.1.
2. **High — używana wersja `expo-screen-capture` 57.0.1 zawiera potwierdzony błąd pozostawiający pełnoekranową czarną warstwę.** Dla najnowszego wideo Storage i odtwarzanie działają, lecz obraz, zdjęcie zastępcze i HUD są zasłonięte. Dźwięk może nadal działać, ponieważ warstwa zakrywa `UIWindow`, a nie zatrzymuje AVPlayera. Szczegóły: §4.1, §5.2.
3. **High — lifecycle guarda wykonuje sekwencję `enable → disable → enable` podczas ładowania pojedynczego NiX-a.** Zwiększa to prawdopodobieństwo trafienia w błąd natywnej biblioteki i wyścigi przy przepinaniu warstwy całego okna. Szczegóły: §3.1.
4. **Medium — kilka niezależnych mechanizmów prywatności może jednocześnie zakryć cały viewer.** Utrudnia to rozpoznanie, która warstwa pozostała aktywna. Szczegóły: §8.1.
5. **Medium — watchdog wideo zgłasza gotowość po czasie nawet bez potwierdzonej klatki obrazu.** Może ukrywać awarię renderera i uruchamiać logikę viewera mimo braku obrazu. Szczegóły: §5.3.
6. **High — monitoring produkcyjny jest programowo wyłączony.** Brakuje runtime dowodu, czy w chwili incydentu iOS raportował nagrywanie, AirPlay/mirroring albo błędny `AppState`. Szczegóły: §10.1.

Najważniejsze rozróżnienie diagnostyczne:

- **Zdjęcie:** obiekt Storage został przedwcześnie usunięty — przyczyna potwierdzona logami.
- **Najnowsze wideo z działającym dźwiękiem:** obiekt istnieje, signed URL i odczyt przez AppleCoreMedia zakończyły się `200`; wspólny czarny ekran wraz z brakiem HUD wskazuje na pełnoekranową warstwę ochrony capture, nie na upload, kodek ani sam komponent wideo.

## 2. Quick wins

### 2.1 Natychmiastowy test rozdzielający wariant ochrony capture

**Severity:** High
**Action:** Na urządzeniu Patrycji wyłączyć nagrywanie ekranu, AirPlay, iPhone Mirroring i udostępnianie ekranu, następnie wymusić zamknięcie aplikacji i otworzyć nowe, istniejące medium.
**Uzasadnienie:** `UIScreen.isCaptured` może być aktywne podczas nagrywania lub mirroringu. Zainstalowany moduł dodaje wtedy czarny `UIView` nad całym oknem: `node_modules/expo-screen-capture/ios/ScreenCaptureModule.swift:91-103,112-123`.
**Ograniczenie:** Ten test nie naprawi obiektów już usuniętych ze Storage.

### 2.2 Zatrzymać rozszerzanie korupcji przed kolejnym cleanupem

**Severity:** Critical
**Action:** Przed wdrażaniem zmian porównać produkcyjną Edge Function z wersją repozytorium i przygotować kontrolowane wdrożenie `cleanup-nix-due` zawierające obsługę `asset_id` oraz `archive_shared_media_nix`.
**Lokalizacja poprawnej logiki:** `supabase/functions/cleanup-nix-due/index.ts:53-82`.
**Uzasadnienie:** Cron uruchamia cleanup co dwie minuty: `supabase/migrations/20260725184405_replay_and_cleanup_cron.sql:35`.

## 3. Concurrency

### 3.1 Guard ochrony jest reaktywowany przy zmianie identyfikatora wyświetlanego NiX-a

**Severity:** High
**Lokalizacja:** `src/hooks/useViewerScreen.ts:196-203`; `src/hooks/useViewerCaptureGuard.ts:11-54`.
**Stan:** Potwierdzony statycznie.

Viewer uruchamia ochronę, zanim kolejka ustali `displayedNix.id`. Po wczytaniu danych ID zmienia się z `undefined` na wartość. Ponieważ `paramNixId` jest zależnością efektu, React uruchamia cleanup starego efektu i nowy efekt:

1. `enableViewerCaptureProtection()`;
2. cleanup: `disableViewerCaptureProtection()`;
3. ponowne `enableViewerCaptureProtection()`.

Operacje JS są serializowane, ale każda z nich zmienia natywne obserwery, pełnoekranową warstwę i hierarchię `UIWindow`. To dokładnie ten lifecycle, w którym upstream odtwarza trwały czarny ekran.

**Action:** W poprawce oddzielić lifecycle ochrony od ID używanego wyłącznie do raportowania screenshotu; aktywacja guarda nie powinna zależeć od `paramNixId`.

## 4. API modernity

### 4.1 Produkcja używa wersji biblioteki z potwierdzonym błędem permanent black screen

**Severity:** High
**Lokalizacja:** `package.json:67`; `node_modules/expo-screen-capture/ios/ScreenCaptureModule.swift:49-57`.
**Stan:** Potwierdzony przez kod zainstalowanej paczki i zaakceptowaną poprawkę upstream.

Projekt deklaruje `expo-screen-capture ~57.0.1`. W tej wersji `allowScreenCapture` przywraca ochronę screenshotów i usuwa observer, ale nie usuwa `blockView`. Expo potwierdziło defekt dla 57.0.0 i 57.0.1; poprawka dodaje `self.blockView?.removeFromSuperview()`. PR został scalony 2026-07-24:

- https://github.com/expo/expo/pull/48000

**Action:** Przy planowaniu poprawki użyć wydania zawierającego PR #48000 albo kontrolowanego patcha natywnego, a następnie przetestować na fizycznym urządzeniu z aktywnym nagrywaniem i mirroringiem.

## 5. Bugs / logic errors

### 5.1 Wdrożony cleanup usuwa współdzielony plik po cleanupie pierwszego odbiorcy

**Severity:** Critical
**Lokalizacja wdrożenia:** produkcyjna Edge Function `cleanup-nix-due` v1.
**Lokalizacja poprawnej wersji repo:** `supabase/functions/cleanup-nix-due/index.ts:53-82`; `supabase/migrations/20260728120000_durable_shared_media_uploads.sql:709-726`; instrukcja wdrożenia `docs/durable-media-upload-runbook.md:20`.
**Stan:** Potwierdzony przez kod wdrożonej funkcji, dane produkcyjne i logi Storage.

Wdrożona wersja nie pobiera `asset_id`, nie wywołuje `archive_shared_media_nix` i usuwa `media_path` bez sprawdzania pozostałych odbiorców. Lokalny kod ma już wymagany mechanizm: RPC liczy aktywne rekordy `sent`, `viewed`, `cleanup_failed` i zwraca `should_delete` dopiero po zniknięciu ostatniej referencji.

Dowód dla mediów Patrycji, czasy UTC:

- zdjęcie: poprawny upload/finalizacja o 19:18:21; cleanup innego odbiorcy usuwa Storage o 19:44:01; Patrycja otwiera o 19:51:45; podpisanie URL zwraca `400`;
- wcześniejsze wideo: poprawny upload/finalizacja o 17:32:27; usunięcie przez cleanup o 18:22:02; otwarcie przez Patrycję o 18:38:19; podpisanie URL zwraca `400`.

Blast radius w chwili audytu:

- 5 assetów ze statusem `ready`, ale bez obiektu Storage: 3 zdjęcia i 2 wideo;
- 2 aktywne NiX-y dwóch odbiorców wskazują na brakujące obiekty.

To jest systemowa utrata danych, nie awaria uploadu. Dla brakującego zdjęcia viewer nie może uzyskać URL, więc `imageReady` nigdy nie staje się prawdziwe, a timer nie startuje: `src/hooks/useViewerScreen.ts:358-407,443-488`.

### 5.2 `allowScreenCapture` może pozostawić czarny overlay bez obserwera, który go usunie

**Severity:** High
**Lokalizacja:** `node_modules/expo-screen-capture/ios/ScreenCaptureModule.swift:49-57,91-123`.
**Stan:** Defekt potwierdzony upstream; zgodność z incydentem potwierdzona logami najnowszego wideo.

Gdy `UIScreen.main.isCaptured == true`, moduł dodaje czarny widok nad pierwszym subview okna. `allowScreenCapture` usuwa observer zmiany stanu przechwytywania, ale w zainstalowanej wersji nie odczepia czarnego widoku. Po zwolnieniu ochrony overlay może pozostać permanentnie.

Dla najnowszego wideo Patrycji:

- upload i finalizacja były prawidłowe;
- signed URL zwrócił `200`;
- Storage zarejestrował dwa `GET 200`, w tym od AppleCoreMedia na jej urządzeniu;
- dźwięk był odtwarzany.

Jednocześnie HUD viewera jest renderowany niezależnie od medium: `src/components/viewer/ViewerScreenSurface.tsx:25-46`. Sam błąd dekodera lub `VideoView` nie wyjaśnia więc zniknięcia obrazu, zdjęcia zastępczego i paska postępu. Pełnoekranowy natywny overlay wyjaśnia wszystkie te objawy jednocześnie.

**Action:** Patrz §3.1 i §4.1. Do regresji włączyć wejście/wyjście z chronionego viewera podczas Screen Recording, AirPlay/iPhone Mirroring i szybkich zmian `active/inactive`.

### 5.3 Watchdog wideo uznaje medium za gotowe bez potwierdzonej klatki

**Severity:** Medium
**Lokalizacja:** `src/components/viewer/ViewerNixVideo.tsx:86-102`.
**Stan:** Potwierdzony statycznie.

Po upływie timeoutu watchdog wywołuje `player.play()`, ustawia `readyEmittedRef = true` i wywołuje `onReady`, niezależnie od `player.status` i bez potwierdzenia, że wyrenderowano pierwszą klatkę. Może to uruchomić logikę postępu mimo czarnej powierzchni odtwarzacza i osłabić diagnostykę.

**Action:** Gotowość UI opierać na natywnym stanie umożliwiającym odtwarzanie oraz zdarzeniu pierwszej klatki; watchdog powinien raportować/odtwarzać ponownie, ale nie fałszować `ready`.

## 6. Security

### 6.1 Polityka deny jest intencjonalna, lecz jej implementacja narusza dostępność

**Severity:** Informational
**Lokalizacja:** `src/hooks/useViewerScreen.ts:187-203`; `src/hooks/useViewerCaptureGuard.ts:16-54`.

Domyślna polityka `deny` jest zgodna z celem prywatności. Audyt nie wykazał obejścia autoryzacji ani wycieku signed URL. Problem polega na implementacji ochrony na poziomie całego `UIWindow`, która może zablokować legalny odczyt odbiorcy.

**Action:** Zachować politykę, ale objąć mechanizm testami dostępności i lifecycle na fizycznych urządzeniach.

## 7. Performance

### 7.1 Upload i transfer nie są wąskim gardłem tego incydentu

**Severity:** Informational
**Lokalizacja:** `src/hooks/useViewerScreen.ts:358-397`.

Logi najnowszego wideo potwierdzają poprawny signed URL i odczyt przez AppleCoreMedia. Brak obrazu nie wynika z timeoutu transferu, rozmiaru pliku ani prefetchu. Dla brakujących obiektów żadne strojenie wydajności nie pomoże, ponieważ Storage zwraca błąd przed pobraniem.

## 8. SwiftUI / UI

### 8.1 Viewer ma kilka nakładających się pełnoekranowych mechanizmów zasłaniania

**Severity:** Medium
**Lokalizacja:** `src/hooks/useViewerScreen.ts:199-203`; `src/components/viewer/ViewerScreenSurface.tsx:151-155`; `src/components/viewer/viewerScreen.styles.ts:118-122`; `node_modules/expo-screen-capture/ios/ScreenCaptureModule.swift:91-160,162-247`.

Równolegle mogą działać:

1. natywny czarny `blockView` dla screen recording/mirroringu;
2. przepięcie `UIWindow.layer` do `secureTextEntry` dla screenshotów;
3. natywny blur app switchera;
4. JS-owa `captureBlurMask`, gdy `AppState !== 'active'`.

Maska JS ma `zIndex: 20`, podczas gdy HUD ma `zIndex: 10`, więc celowo zasłania także pasek postępu. Statycznie warunek powinien zniknąć po powrocie do `active`, ale bez telemetryki produkcyjnej nie można wykluczyć pozostania błędnego snapshotu `AppState`.

**Action:** Uprościć własność warstw prywatności i wprowadzić jawny, logowalny stan mechanizmu, który aktualnie zasłania viewer.

## 9. Dead code / duplication / refactor

### 9.1 Odpowiedzialność za ochronę viewera jest rozproszona

**Severity:** Medium
**Lokalizacja:** `src/hooks/useViewerCaptureGuard.ts:11-54`; `src/lib/viewerCaptureProtection.ts:1-49`; `src/hooks/useViewerScreen.ts:199-203`; `src/components/viewer/ViewerScreenSurface.tsx:151-155`.

Nie znaleziono istotnego martwego kodu, ale logika ochrony jest rozdzielona między hook, kolejkę operacji natywnych, AppState i powierzchnię UI. Każda część ma własny cleanup. To utrudnia zachowanie jednego inwariantu: „po opuszczeniu viewera nie istnieje żadna należąca do niego warstwa”.

**Action:** Po naprawie funkcjonalnej skonsolidować lifecycle w jednym kontrolerze ze stanami `disabled/enabling/enabled/disabling/error`.

## 10. Cross-cutting recommendations

### 10.1 Brak produkcyjnej obserwowalności viewera uniemożliwia rozstrzygnięcie dokładnego triggera

**Severity:** High
**Lokalizacja:** `src/lib/monitoring.ts:4-7,24-65`.

`SENTRY_RUNTIME_ENABLED = false`, więc zdalny sink telemetryki pozostaje wyłączony niezależnie od zmiennej środowiskowej. Nie ma zapisu:

- `AppState` w chwili pojawienia się czerni;
- stanu `UIScreen.isCaptured`;
- sekwencji enable/disable ochrony;
- faktycznej pierwszej klatki wideo;
- identyfikatora aktywnej warstwy zasłaniającej.

**Action:** Przed kolejnym wydaniem dodać zanonimizowane zdarzenia lifecycle i capture bez ścieżek, URL-i ani danych użytkownika. Włączyć je co najmniej dla kontrolowanej grupy diagnostycznej.

### 10.2 Rozjazd kodu i wdrożenia wymaga bramki release

**Severity:** Critical
**Lokalizacja:** `docs/durable-media-upload-runbook.md:20`; `supabase/functions/cleanup-nix-due/index.ts:53-82`.

Repozytorium zawiera poprawną logikę shared assets, ale produkcyjna funkcja pozostała na starej wersji. Migracja bazy i funkcja Edge muszą być wdrażane jako jeden kompatybilny zestaw.

**Action:** Dodać automatyczną weryfikację wersji/hashu Edge Function po deployu oraz smoke test z dwoma odbiorcami: cleanup pierwszego nie może usunąć obiektu, drugi nadal musi uzyskać signed URL.

## 11. What was NOT audited

- Nie odtwarzano konta Patrycji ani prywatnych mediów w symulatorze.
- Nie zmieniano danych, statusów NiX-ów, obiektów Storage ani funkcji produkcyjnych.
- Nie wykonywano patcha `expo-screen-capture` ani wdrożenia lokalnej wersji cleanupu.
- Nie przeprowadzono pełnego audytu całej aplikacji poza ścieżką odbioru mediów i zależnymi mechanizmami.
- Symulator nie pozwolił odtworzyć zalogowanego viewera; ekran autoryzacji blokował ścieżkę. Wnioski o produkcji opierają się na kodzie, logach Storage, danych DB i potwierdzonym defekcie upstream.
- Dokładny stan Screen Recording/AirPlay/iPhone Mirroring na urządzeniu w chwili incydentu nie jest rejestrowany, dlatego trigger §5.2 ma wysoką, lecz nie stuprocentową pewność. Sam defekt używanej biblioteki jest potwierdzony.

## 12. Verification

### 12.1 Weryfikacja statyczna i testy projektu

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- Vitest: 4 pliki dotyczące ochrony/viewera/usług mediów, 43 testy — passed.
- Natywny build iOS — succeeded, 0 errors; ostrzeżenia pochodziły głównie z zależności.
- `git diff --check` — wykonywany po zapisaniu raportu.

### 12.2 Weryfikacja produkcyjna

- Sprawdzono wersję aplikacji/runtime i urządzenie odbiorcy.
- Skorelowano upload/finalizację, cleanup, otwarcie wiadomości, signed URL i GET Storage.
- Dla zdjęcia i wcześniejszego wideo potwierdzono usunięcie obiektu przed otwarciem.
- Dla najnowszego wideo potwierdzono signed URL `200` i odczyt `GET 200` przez AppleCoreMedia, co wyklucza Storage jako przyczynę wariantu „audio działa”.
- Porównano produkcyjną `cleanup-nix-due` v1 z bieżącym kodem repozytorium.

### 12.3 Weryfikacja upstream

- Expo PR #48000, scalony 2026-07-24, opisuje dokładnie permanentny czarny ekran w 57.0.0/57.0.1 i dodaje brakujące usunięcie overlayu: https://github.com/expo/expo/pull/48000
- Expo issue #41279 potwierdza, że aktywna ochrona podczas nagrywania celowo daje czarny pełny ekran: https://github.com/expo/expo/issues/41279
- Apple dokumentuje stan przechwytywania przez `UIScreen.isCaptured`: https://developer.apple.com/documentation/uikit/uiscreen/iscaptured
