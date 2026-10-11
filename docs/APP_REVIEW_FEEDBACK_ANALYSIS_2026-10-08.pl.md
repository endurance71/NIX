# NiX — analiza zgłoszenia i feedbacku App Review, 2026-10-08

## Wniosek

Publiczne zgłoszenie **1.0.11 (6)** nadal ma status **Rejected / Unresolved Issues**. Jedyny wskazany problem to **2.1.0 — Performance: App Completeness**, a wiadomość dotyczy **Information Needed — New App Submission**. Apple potrzebuje informacji i dowodów działania aplikacji przy ograniczonej historii konta deweloperskiego. Nie podało konkretnej awarii, kroków odtworzenia błędu ani stwierdzonego naruszenia zasad moderacji.

Obecne zgłoszenie nie jest gotowe do ponownego wysłania: brakuje nagrania i pełnej odpowiedzi na sześć pytań. Dodatkowo dzisiejsze sprawdzenie wykazało HTTP 404 pod adresami wsparcia, prywatności i regulaminu. To aktualne ustalenie audytu, **nie zarzut z wiadomości Apple**. Uruchomienie nowego builda w Internal TestFlight nie zamyka publicznego odrzucenia.

Zakres tej pracy: odczyt App Store Connect, wiadomości Apple, publicznych adresów i porównanie z kodem oraz dokumentacją. Bez odpowiedzi do Apple, zmiany ustawień, resubmission, publikacji, deploymentu backendu lub nowych testów wykonanych na produkcyjnych kontach.

## Fakty z App Store Connect

| Pole | Stan sprawdzony 2026-10-08 |
| --- | --- |
| Aplikacja | NiX Now Chat, `6791332379` |
| Publiczna wersja / build | **1.0.11 (6)** |
| Status | **Rejected**, **Unresolved Issues** |
| Zgłoszenie | `8db797c3-1620-4294-8af2-8d3e688ba4f3` |
| Data wysłania | Sep 12, 2026 at 4:19 PM — zapis widoczny w ASC |
| Wiadomość Apple | 2026-09-13 3:16 AM — zapis widoczny w ASC |
| Powód | 2.1.0 Performance: App Completeness |
| Korespondencja | Messages (1); jedna wiadomość Apple, brak widocznej odpowiedzi dewelopera |
| Wydanie po zatwierdzeniu | Ręczne |
| Nowszy build testowy | **1.0.12 (7), Testing / Internal**, runtime 1.0.12 |
| Dystrybucja publiczna | Wybrana; 175 regionów oznaczonych Available; aktualna cena bezpłatna |

Godziny powyżej są prezentacją ASC; nie dopisano niezweryfikowanej strefy czasowej. Lista App Review pokazała jedno zgłoszenie w swoim dostępnym zakresie historii, co nie jest dowodem braku innych zgłoszeń poza tym zakresem.

[Otwórz konkretne zgłoszenie i wiadomość Apple](https://appstoreconnect.apple.com/apps/6791332379/distribution/reviewsubmissions/details/8db797c3-1620-4294-8af2-8d3e688ba4f3).

## Jak interpretować wiadomość

Apple prosi o nagranie z fizycznego urządzenia z najnowszym systemem oraz odpowiedzi dotyczące celu aplikacji, dostępu, usług, regionów i ewentualnych uprawnień. Chce otrzymać je **zarówno w odpowiedzi w ASC, jak i w polu Notes w App Review Information**.

Końcowy fragment „Prevent Common Issues” przypomina o błędach, kontach demo, screenshotach, IAP i aplikacjach firmowych. Nie są to kolejne potwierdzone powody odrzucenia NiX. W szczególności wiadomość nie twierdzi, że NiX ma płatności, nieprawidłowe screenshoty, nieskuteczną moderację czy charakter aplikacji wyłącznie dla pracowników.

Nie wynika z niej także, że pozostałe obszary zostały już zatwierdzone. Reviewer może je ocenić po otrzymaniu materiałów. Odpowiedź powinna kolejno obsłużyć wszystkie sześć pytań, zamiast tylko informować, że aplikacja działa.

## Sześć wymagań Apple a obecna zawartość zgłoszenia

| Wymaganie | Obecny stan | Co uzupełnić |
| --- | --- | --- |
| 1. Nagranie fizycznego urządzenia | **Brak widocznego nagrania lub linku** w sprawdzonej korespondencji i Notes | Uruchomienie, rejestracja, logowanie, typowy czat, zdjęcie, film, zgłoszenie treści, blokowanie użytkownika, usunięcie konta. Wskazać model, system i dokładny build. |
| 2. Cel, odbiorcy, problem i wartość | **Częściowo**: opisano prywatną komunikację 1:1 dla 16+ | Wyjaśnić wartość krótkiej wymiany między zaakceptowanymi znajomymi i brak publicznego feedu. Zaznaczyć, że to aplikacja konsumencka dostępna publicznie, a nie narzędzie dla jednej firmy. |
| 3. Dostęp i instrukcja głównych funkcji | **Częściowo**: dwa połączone konta demo, instrukcja wysyłki oraz usuwania konta | Ponownie sprawdzić logowanie obu kont na wybranym buildzie. Opisać onboarding, odbieranie wiadomości i dokładne gesty/menu report/block. Dane dostępowe pozostawić wyłącznie w prywatnym ASC. |
| 4. Usługi zewnętrzne | **Częściowo**: Notes wspominają Azure i Expo | Zebrać Supabase, Apple, Expo/EAS oraz Azure; wyjaśnić OVH jako hosting workera moderacji w obecnej architekturze. Zweryfikować, które usługi rzeczywiście obsługują zgłaszany build i bieżący backend. |
| 5. Różnice regionalne | **Brak jawnej odpowiedzi** | Opisać PL/EN oraz funkcje w wybranych regionach dystrybucji. Kod nie wykazał badanych przełączników funkcji według kraju, ale nie zastępuje to sprawdzenia dostępności usług w każdym kraju. |
| 6. Branże regulowane / chronione materiały | **Brak jawnej odpowiedzi** | Potwierdzić stosowne „not applicable” dla rzeczywistej działalności. Jeśli nie ma katalogu licencjonowanych materiałów ani regulowanych usług, wyjaśnić to; sam UGC nie stanowi dowodu naruszenia praw. |

Istniejące Notes mają użyteczne informacje: dwa połączone konta demo, brak IAP/reklam/subskrypcji, opcjonalne push i Live Activity, filtr przed dostarczeniem, report/block i usuwanie konta. Problemem jest niepełność odpowiedzi na aktualną prośbę, a nie całkowity brak instrukcji.

Adresy kont demo mają domenę `example.invalid`. To może być celowe dla wcześniej utworzonych kont; nie dowodzi awarii logowania. Nie potwierdzono jednak dzisiaj, że oba konta nadal się logują i mają właściwy stan. Do rejestracji w nagraniu trzeba użyć oddzielnego konta i kontrolowanej skrzynki, jeśli flow wymaga potwierdzenia e-maila.

## Dodatkowe aktualne ustalenia

### 1. Niedziałające publiczne adresy — priorytet przed kolejnym zgłoszeniem

| Adres | Wynik odczytu 2026-10-08 |
| --- | --- |
| `https://nix.damianmotylinski.pl/privacy/` — wpisany w App Privacy | **HTTP 404**, strona „Not Found”; potwierdzona również w przeglądarce |
| `https://nix.damianmotylinski.pl/support` — wpisany w metadanych wersji | **HTTP 404** |
| `https://nix.damianmotylinski.pl/terms/` — adres dokumentacji prawnej | **HTTP 404** |

Sprawdzenie HTTP wykonano dwukrotnie, także z typowym User-Agent przeglądarki; serwer zwracał stronę LiteSpeed 404. Nie ustalono przyczyny konfiguracji hostingu ani momentu awarii. Nie ma podstaw przypisywać tego wrześniowemu odrzuceniu. Historyczne wpisy o działaniu adresów 2026-09-12 nie potwierdzają ich aktualnego stanu.

Materiały prawne są dostępne lokalnie w `docs/legal/` i `src/lib/legalDocuments.ts`. To nie zastępuje działającego publicznego URL. Należy przywrócić właściwe strony PL/EN, kontakt wsparcia i następnie sprawdzić zawartość oraz odpowiedzi HTTP z urządzenia poza lokalnym środowiskiem. Apple wymaga dostępnej polityki w metadanych i aplikacji oraz kompletnego dostępu do ocenianej usługi. [App Review Guidelines, 2.1 i 5.1.1](https://developer.apple.com/app-store/review/guidelines/).

### 2. „iPhone-only” a Mac i Vision Pro

Review Notes deklarują iPhone-only, a `app.json` ma `supportsTablet=false`. Tymczasem w ASC:

- **Make this app available** dla Apple Silicon Macs jest włączone;
- **Make this app available on Apple Vision Pro** jest włączone;
- Apple zaznacza brak zweryfikowanej przez dewelopera kompatybilności Mac; automatyczne „Version 1.0.11 is compatible” nie jest wynikiem QA.

Jeśli zakres ma pozostać iPhone, rekomendacją jest wyłączenie dystrybucji Mac/Vision przed zgłoszeniem. Alternatywa: rzeczywiste QA tych platform i zgodne Notes. Nie zmieniono checkboxów podczas tej analizy. `supportsTablet=false` nie ustawia tych pól w ASC. Pozostaje także sprawdzenie iPadowego trybu zgodności, jeżeli aplikacja jest w nim udostępniana; nie traktować go automatycznie jako natywnego layoutu iPad.

### 3. Build 7 nie zastępuje builda 6 w publicznym zgłoszeniu

Dzisiejszy **1.0.12 (7)** został wyeksportowany z `testFlightInternalTestingOnly=true`. Nie można wybrać go do publicznego App Review. [Dokumentacja Apple o Internal Only](https://developer.apple.com/tutorials/develop-in-swift/test-your-beta-app).

Dwie możliwe ścieżki:

1. **Uzupełnienie zgłoszenia 1.0.11 (6):** samo żądanie informacji nie wymusza nowego binarium. Najpierw trzeba potwierdzić działanie tej wersji i backendu, a nagranie musi odpowiadać temu, co reviewer dostanie. Apple dopuszcza ponowne użycie builda przy poprawie metadanych. [Obsługa odpowiedzi App Review](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/reply-to-app-review-messages/).
2. **Zgłoszenie aktualnych zmian:** przygotować kolejny wolny numer builda, np. **1.0.12 (8)** po potwierdzeniu dostępności numeru, z eksportem dopuszczającym publiczny App Store. Przetestować ten artefakt, zaktualizować wersję/Notes/runtime i nagrać właśnie jego działanie.

Druga ścieżka jest rekomendowana, jeśli do klientów mają trafić obecne poprawki i nowe powiadomienia. Nie wystarczy nagrać builda 7 i pozostawić builda 6 w zgłoszeniu. Notes dotyczące OTA runtime 1.0.11 również trzeba dostosować do finalnego kandydata. Nie używać OTA do obchodzenia weryfikacji zmian natywnych.

### 4. UGC, usuwanie konta i produkcja

Aktualny kod zawiera rejestrację/logowanie, usuwanie konta przez `delete-account`, zgłoszenia przez `report-content` i blokowanie przez `block-user`. To podstawa do demonstracji, nie dowód ich dzisiejszego działania na produkcji. Moderacja obejmuje tekst, zdjęcia i wybrane klatki filmu; nie opisywać jej jako skanowania całego filmu.

W Notes jest deklaracja obsługi zgłoszeń przez ludzi i retencji dowodów przez 30 dni. Retencja nie określa czasu reakcji moderatora. Przed kolejną odpowiedzią należy potwierdzić czynny kontakt, odpowiedzialną osobę, sposób obsługi zgłoszeń i sprawdzić efekt blokowania oraz realne usunięcie danych testowego konta. To obszary następnej weryfikacji, **nie stwierdzone naruszenie 1.2 w otrzymanym feedbacku**. [Wymagania Apple dotyczące UGC](https://developer.apple.com/app-store/review/guidelines/).

Nie wdrażano backendowych zmian z obecnej gałęzi. Wrześniowe potwierdzenia flagi moderacji, budżetu Azure i działania workera są historyczne. Dzisiejsze testy jednostkowe i QA kamery nie zastępują próby kompletnego flow Auth/Storage/moderacji na finalnym kandydacie.

### 5. Prywatność, wiek i metadane

App Privacy deklaruje siedem rodzajów danych powiązanych z użytkownikiem, na potrzeby działania aplikacji: Name, Email Address, Emails or Text Messages, Photos or Videos, Other User Content, User ID, Device ID. Nie deklaruje trackingu ani diagnostyki. Aktualny kod ma wyłączone domyślnie Sentry i product analytics; nie wskazano automatycznego naruszenia ATT na podstawie samej obecności SDK. Rzeczywiste ustawienia zgłaszanego builda i backendu wymagają osobnego potwierdzenia.

Globalna ocena ASC wynosi 16+ z lokalnymi wariantami, m.in. Korea 15+; aplikacja egzekwuje własne minimum 16+. Nie jest to samo w sobie sprzeczność. Nie przejrzano wszystkich odpowiedzi kwestionariusza wieku, więc nie potwierdzono kompletności odpowiedzi Messaging/Social Media.

W ASC aplikacja nazywa się NiX Now Chat, a część repozytorium używa NiX. Ujednolicić nowe materiały, lecz nie uznawać tego za podany powód odrzucenia. Puste opcjonalne Marketing URL, Promotional Text i User Privacy Choices URL nie zostały uznane za blokery. Nie wykonano pełnej wizualnej oceny wszystkich screenshotów i lokalizacji. Nie potwierdzono regionalnych formalności dla wszystkich 175 regionów; należy ocenić je po ustaleniu rzeczywistego zakresu dystrybucji.

## Scenariusz nagrania dla Apple

Nagranie wykonać na fizycznym urządzeniu z najnowszą stabilną wersją systemu dostępną dla niego. Zanotować model, pełną wersję OS, wersję/build aplikacji, runtime/OTA jeśli dotyczy i datę próby. Materiał ma pokazywać normalne działanie tej samej wersji, która będzie oceniana.

1. Zacząć od uruchomienia aplikacji z ikony; pokazać logowanie i nową rejestrację, onboarding oraz potwierdzenie 16+. Gdy wymagana jest aktywacja e-maila, pokazać jej rezultat bez ujawniania kodów lub prywatnych wiadomości.
2. Na odrębnych kontach testowych pokazać dodanie/akceptację znajomego. W instrukcji dla reviewera użyć już połączonych kont, żeby nie zależał od osoby akceptującej zaproszenie.
3. Wysłać i odebrać tekst, zdjęcie oraz krótki film; pokazać widoczny wynik po moderacji, odczyt oraz podgląd. Korzystać z neutralnych materiałów należących do testujących.
4. Zgłosić wiadomość, pokazać potwierdzenie i zablokować nadawcę. Zweryfikować skutki blokady; nie demonstrować jedynie otwarcia menu.
5. Usunąć **oddzielne konto demonstracyjne** przez właściwą ścieżkę w profilu. Pokazać zakończenie i brak możliwości dalszego używania konta. Konta demo Apple zachować aktywne i połączone. Usunięcie konta jest osobną świadomą czynnością osoby nagrywającej.
6. Płatne funkcje oznaczyć jako nieobecne: według kodu/listingu brak IAP, subskrypcji i płatnych treści. Nagranie nie potrzebuje fikcyjnego zakupu.

Kod viewer włącza ochronę screen capture, gdy polityka relacji zabrania przechwytywania (`useViewerCaptureGuard.ts`, `viewerCaptureProtection.ts`). W filmie może to ukryć media. Na odrębnej demonstracyjnej relacji użyć istniejącego ustawienia zgody na zrzuty w ekranie znajomych; sprawdzić nagrany wynik przed udostępnieniem. Nie wyłączać ochrony globalnie ani dla rzeczywistych prywatnych wiadomości. Jeśli potrzebny jest dodatkowy film pokazujący chroniony ekran, traktować go jako uzupełnienie i wyjaśnić ochronę — nie zastępuje automatycznie wymaganego screen recording.

Nagranie/link musi być dostępne reviewerowi bez dołączania do zespołu, wygasającego logowania lub żądania dostępu. Nie wkładać haseł, tokenów, realnych danych czy treści użytkowników do filmu lub Git. Można rozdzielić demonstrację na logiczne nagrania z opisem segmentów, ale Apple wymaga pełnego typowego flow zaczynającego się uruchomieniem.

## Zalecana kolejność przed resubmission

1. Przywrócić strony privacy/support/terms; potwierdzić HTTP 200, właściwe dokumenty PL/EN i kontakt.
2. Ustalić finalny build i platformy: pozostanie przy 6 albo nowy publiczny kandydat; rozstrzygnąć Mac/Vision. Nie zmieniać niczego tylko po to, aby ukryć brak QA.
3. Sprawdzić dwa konta demo oraz pełny flow rejestracji, wysyłki, odbioru, moderacji, report/block i deletion na tym samym artefakcie z aktualnym backendem. Potwierdzić obsługę zgłoszeń i dostępność usług.
4. Nagrać działanie fizycznego urządzenia, zweryfikować dostępność materiału i opisać wersję/OS. Aktualne zgłoszenie i film muszą być zgodne.
5. Dokończyć sześciopunktową odpowiedź EN; tę samą informację zapisać w Notes. Szkic obok raportu zawiera jawne miejsca wymagające dowodów.
6. Po osobnym zleceniu odpowiedzi/wysłania wykonać właściwą operację w ASC. Dopiero zatwierdzenie publicznego App Review pozwala przejść do ręcznego wydania.

## Materiały i ograniczenia dowodu

- Lokalny szkic: [apple-review-response-draft-2026-10-08.en.md](release/apple-review-response-draft-2026-10-08.en.md). **Nie został wysłany i nie jest gotowy do wysłania bez uzupełnienia.**
- Aktualny stan wydań: [ios-current.md](release/ios-current.md).
- Dokumentacja funkcji: [listing](app-store-listing.md), [privacy](legal/privacy-policy.en.md), [terms](legal/terms.en.md), [QA](testing/app-review-device-smoke.md).
- Techniczne wyniki obecnej gałęzi: [implementacja](IMPLEMENTATION_2026-10-08.pl.md), [React Doctor zero](REACT_DOCTOR_ZERO_2026-10-08.pl.md). Nie utożsamiać ich z akceptacją builda 6 przez Apple.
- Historyczne audyty sierpniowe nie są wiadomościami Apple ani aktualnym stanem produkcji.

Dowody spoza Git: `/Users/damianmotylinski/.nix-ops/app-review-analysis-2026-10-08/`: `apple-feedback.txt`, `apple-feedback.jpg`, `app-privacy.txt`, `pricing-availability.txt`, `platform-availability.jpg`, `public-urls.json`, `public-urls-confirmed.json`, `privacy-404.jpg`. Dane kont demo celowo pominięto w tym raporcie i szkicu.

Nie wykonano ponownego logowania na konta demo, nagrania fizycznego urządzenia, deletion, produkcyjnego QA Auth/Storage, testów Mac/Vision/iPad/IPv6, pełnego audytu screenshotów ani formalności wszystkich regionów. Analiza nie daje gwarancji zatwierdzenia. Nie uruchamiano ponownie testów kodu, ponieważ ten etap zmienia wyłącznie dokumentację.
