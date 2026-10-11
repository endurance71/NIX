# NiX 1.0.12 (10) — finalne QA i nagranie

**Wynik: PARTIAL PASS; pozostała macierz PENDING.** Backend smoke i CI PASS nie zastępują QA finalnej aplikacji z TestFlight. Historyczne potwierdzenie kamery na buildzie development nie jest dowodem dla IPA 10.

## Identyfikacja

- Instalacja: TestFlight → NiX Internal QA → **1.0.12 (10)**. Nie wybierać 7, 8 ani 9.
- Runtime 1.0.12, kanał production; nie publikować OTA w trakcie QA.
- IPA builda 10 SHA256: `ae95660ba5de534fbc532c4e84f22e462aad27228e87518a0ab26c0c14d17ec1` — dokładny podpisany pakiet uploadu Xcode. Historyczny hash builda 9 znajduje się w ios-current.md.
- iPhone Damian: model 16 Pro Max; przed nagraniem potwierdzić wersję iOS w Ustawieniach. Poprzedni odczyt: 27.0.1 (24A446).
- Dla każdego wyniku zapisać datę, urządzenie/OS, build, scenariusz, PASS/FAIL, plik nagrania i znacznik czasu. Dane logowania reviewerów wyłącznie w prywatnym ASC.

## Potwierdzenie właściciela — 2026-10-09

Właściciel potwierdził zainstalowany build 10 na iPhonie Damian oraz PASS dla logowania e-mail/Apple i wysyłania/odbioru tekstu, zdjęcia i krótkiego filmu. To dowód deklaratywny dla tych scenariuszy; brak nagrania i pełnej macierzy. Model/OS odczytany wcześniej: iPhone 16 Pro Max / 27.0.1. Backend Auth: drugie konto reviewera z Notes PASS; główne pole ASC ma username zamiast e-maila, próba pierwszego adresu z Notes z hasłem głównego pola zwróciła HTTP400 `invalid_credentials`, także po deklarowanej poprawce danych. Właściciel musi potwierdzić właściwy e-mail; relacja obu kont pozostaje pending.

## Scenariusz nagrania dla Apple

1. Pokazać numer wersji/builda i uruchomić aplikację od początku. Nagrywać prawdziwy iPhone na najnowszym wspieranym stabilnym iOS; materiał symulatora nie wystarcza.
2. Utworzyć osobne konto demonstracyjne, pokazać rejestrację lub logowanie, onboarding oraz potwierdzenie wieku 16+. Właściciel sam akceptuje wymagane warunki. Nie używać kont reviewerów do usuwania.
3. Połączyć konto demonstracyjne z drugim kontrolowanym kontem poprzez istniejący proces zaproszenia. Pokazać listę znajomych i otwarcie rozmowy.
4. Wysłać tekst, zrobić i wysłać zdjęcie, nagrać i wysłać krótki film. Pokazać status oczekiwania na moderację oraz odbiór na drugim koncie. Nie ujawniać prywatnych rozmów i materiałów innych osób.
5. Dla tej relacji włączyć istniejącą zgodę na przechwytywanie ekranu przed demonstracją viewer. Pokazać zdjęcie i film w viewer. Nie wyłączać ochrony globalnie.
6. Przytrzymać odebraną wiadomość → **Zgłoś / Report** → wybrać przyczynę i pokazać wynik.
7. Menu nagłówka rozmowy → **Zablokuj / Block** → pokazać potwierdzenie i brak dalszej komunikacji z zablokowaną osobą.
8. Profil → Konto → **Usuń konto / Delete account** na osobnym koncie, wykonać wymagane ponowne uwierzytelnienie i pokazać końcowy ekran.
9. Przekazać film w dostępnej dla Apple postaci i sprawdzić odtwarzanie oraz dostęp bez prywatnej sesji właściciela. Zachować oba połączone konta reviewerów aktywne.

## Macierz QA finalnego artefaktu

Pierwszy wariant 10 na iPhone 16e: domyślny login mieści się w ekranie, przy Text Size 7 etykieta przycisku jest ucięta. Elastyczna wysokość przycisku została poprawiona. Podpisany Release simulator z `9b1d344` przeszedł regresję przy Text Size 7 / Light na iPhone 16e / iOS 27.0: pełna etykieta „Zaloguj”, widoczny przycisk Apple i jednowierszowy separator „lub”. Dowód prywatny: `build10/iphone16e-primary-button-large-text-after.jpg`. Po przywróceniu Text Size 3 i ponownym uruchomieniu sprawdzono domyślny jasny login oraz ciemny ekran z walidacją pustego e-maila; oba PASS. Dowody: `iphone16e-login-default-final.jpg`, `iphone16e-login-dark-validation-final.jpg`. Nie uznawać wcześniejszego QA separatora za PASS całego scenariusza dużej czcionki.

Historyczna próba builda 9: podpisany Release simulator przeszedł czysty start do logowania na iPad Pro 13 (M5), iOS 27.0. Początkowy wariant bez podpisu nie miał symulowanych entitlements i pokazywał błąd SecureStore; podpisany wariant działał bez zmian kodu. Jasny/ciemny ekran logowania i walidacja pustego e-maila sprawdzone. Duży tekst ujawnił zawijanie „lub”; podpisany Release simulator 10 przeszedł regresję separatora PL przy Text Size 7 / Dark i domyślny login przy Text Size 3 / Light. Kontrole dotyczą wyłącznie tych widoków, a nie pełnego flow. Nie oznacza to pełnego flow, TestFlight QA ani nagrania dla Apple.

| Scenariusz | Wynik i dowód |
| --- | --- |
| Czysta instalacja; aktualizacja istniejącej instalacji 6/7 | PENDING |
| E-mail; Sign in with Apple; wylogowanie/zmiana konta | Login e-mail/Apple PASS — właściciel, build10; logout/zmiana konta PENDING |
| Onboarding 16+ i zapis aktualnej wersji dokumentów | PENDING |
| Błędy zmiany/resetu hasła PL/EN | FAIL build10: surowy błąd same_password po angielsku na screenie właściciela. Poprawka klienta i 15 regresji PASS; nowy binary i QA PENDING |
| Zdjęcie/film, preview, wysyłka i odbiór, viewer | Tekst/zdjęcie/krótki film send+receive PASS — właściciel, build10; preview/viewer pełne QA PENDING |
| Report/block/delete osobnego konta; reviewerzy pozostają aktywni | Backend PASS, binary PENDING |
| Offline/retry, tło, powrót po ubiciu, brak podwójnej wysyłki | PENDING |
| Odmowa kamery/mikrofonu/zdjęć/push; ponowne wejście | PENDING |
| Powiadomienia nad arkuszem i klawiaturą; tap/swipe/cleanup sesji | PENDING |
| Jasny/ciemny motyw, PL/EN, długie komunikaty, duża czcionka | PENDING |
| VoiceOver: pełna treść i zamknięcie, bez automatycznego znikania | PENDING |
| Reduce Motion: fade, poprawne gesty | PENDING |
| iPhone bez wyspy; iPad w trybie zgodności | iPhone/full flow PENDING; iPad login/PL divider large text PASS na signed simulator 10 |
| Sieć IPv6/NAT64 | PENDING |
| Oba reviewer logins na finalnym buildzie, istniejąca relacja | Peer Auth API PASS; główny login/e-mail wymaga poprawienia w ASC. Binary/relacja PENDING |
| Film kompletny, aktualny, dostępny reviewerowi | PENDING |

## Wstrzymanie gotowości

Wybór builda 10 w ASC jest zapisany i zweryfikowany. READY FOR APP REVIEW nadal wymaga dowodów dla pozostałej macierzy, kompletnej odpowiedzi na sześć pytań oraz rozstrzygnięcia DSA i wymagań regionalnych. Odpowiedź Apple, resubmission i wydanie publiczne wymagają osobnego polecenia właściciela.

## What to Test — zapisane dla builda 10

Obie wersje zapisano razem w polu English(U.S.), jedynym dostępnym selektorze Test Details. Build 10 jest przetworzony i dostępny w NiX Internal QA oraz Team (Expo).

### PL

Sprawdź NiX 1.0.12 (10). Buildy 8/9 zostały zastąpione; finalne wyniki zapisuj dla builda 10.

Sprawdź czystą instalację i aktualizację, logowanie e-mail/Apple, onboarding 16+, zmianę konta i powrót offline. Na kontrolowanych kontach przetestuj tekst, zdjęcie i krótki film: kamera → podgląd → wysyłka → odbiór → viewer. Sprawdź wznowienie wysyłki po utracie sieci i przejściu w tło, bez duplikatów. Zgłoś testową wiadomość, zablokuj jej nadawcę i usuń oddzielne konto demonstracyjne. Zachowaj konta reviewerów.

Sprawdź powiadomienia nad arkuszami i klawiaturą, tap/swipe, oba motywy, PL/EN, dużą czcionkę, VoiceOver i Reduce Motion. Odmów uprawnień i sprawdź możliwość ponownego wejścia. Zapisuj urządzenie, iOS, build oraz kroki i nagranie błędu. Nie przesyłaj haseł ani prywatnych rozmów w feedbacku.

### EN

Test NiX 1.0.12 (10). Builds 8/9 are superseded; record final results for build 10.

Check clean installation and upgrade, email/Apple sign-in, age-16 onboarding, account switching and offline recovery. With controlled test accounts, test text, photos and a short video: camera → preview → send → receive → viewer. Check upload recovery after network loss and backgrounding, without duplicates. Report a test message, block its sender and delete a separate demonstration account. Preserve the reviewer accounts.

Check notifications above sheets and the keyboard, tap/swipe dismissal, both themes, PL/EN, large text, VoiceOver and Reduce Motion. Deny permissions and check recovery when reopening the screen. Include device, iOS, build, reproduction steps and a recording for failures. Do not include passwords or private conversations in feedback.
