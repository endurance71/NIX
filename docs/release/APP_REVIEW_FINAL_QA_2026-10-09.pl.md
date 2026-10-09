# NiX 1.0.12 (10) — finalne QA i nagranie

**Wynik: PENDING.** Backend smoke i CI PASS nie zastępują QA finalnej aplikacji z TestFlight. Historyczne potwierdzenie kamery na buildzie development nie jest dowodem dla IPA 10.

## Identyfikacja

- Instalacja: TestFlight → NiX Internal QA → **1.0.12 (10)**. Nie wybierać 7, 8 ani 9.
- Runtime 1.0.12, kanał production; nie publikować OTA w trakcie QA.
- IPA builda 10 SHA256: pending — zostanie zapisany po finalnym podpisaniu i uploadzie. Historyczny hash builda 9 znajduje się w ios-current.md.
- iPhone Damian: model 16 Pro Max; przed nagraniem potwierdzić wersję iOS w Ustawieniach. Poprzedni odczyt: 27.0.1 (24A446).
- Dla każdego wyniku zapisać datę, urządzenie/OS, build, scenariusz, PASS/FAIL, plik nagrania i znacznik czasu. Dane logowania reviewerów wyłącznie w prywatnym ASC.

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

Pierwszy wariant 10 na iPhone 16e: domyślny login mieści się w ekranie, przy Text Size 7 etykieta przycisku jest ucięta. Elastyczna wysokość przycisku została poprawiona; ponowny build i natywna regresja pozostają pending. Nie uznawać wcześniejszego QA separatora za PASS całego scenariusza dużej czcionki.

Historyczna próba builda 9: podpisany Release simulator przeszedł czysty start do logowania na iPad Pro 13 (M5), iOS 27.0. Początkowy wariant bez podpisu nie miał symulowanych entitlements i pokazywał błąd SecureStore; podpisany wariant działał bez zmian kodu. Jasny/ciemny ekran logowania i walidacja pustego e-maila sprawdzone. Duży tekst ujawnił zawijanie „lub”; podpisany Release simulator 10 przeszedł regresję separatora PL przy Text Size 7 / Dark i domyślny login przy Text Size 3 / Light. Kontrole dotyczą wyłącznie tych widoków, a nie pełnego flow. Nie oznacza to pełnego flow, TestFlight QA ani nagrania dla Apple.

| Scenariusz | Wynik i dowód |
| --- | --- |
| Czysta instalacja; aktualizacja istniejącej instalacji 6/7 | PENDING |
| E-mail; Sign in with Apple; wylogowanie/zmiana konta | PENDING |
| Onboarding 16+ i zapis aktualnej wersji dokumentów | PENDING |
| Zdjęcie/film, preview, wysyłka i odbiór, viewer | PENDING |
| Report/block/delete osobnego konta; reviewerzy pozostają aktywni | Backend PASS, binary PENDING |
| Offline/retry, tło, powrót po ubiciu, brak podwójnej wysyłki | PENDING |
| Odmowa kamery/mikrofonu/zdjęć/push; ponowne wejście | PENDING |
| Powiadomienia nad arkuszem i klawiaturą; tap/swipe/cleanup sesji | PENDING |
| Jasny/ciemny motyw, PL/EN, długie komunikaty, duża czcionka | PENDING |
| VoiceOver: pełna treść i zamknięcie, bez automatycznego znikania | PENDING |
| Reduce Motion: fade, poprawne gesty | PENDING |
| iPhone bez wyspy; iPad w trybie zgodności | iPhone/full flow PENDING; iPad login/PL divider large text PASS na signed simulator 10 |
| Sieć IPv6/NAT64 | PENDING |
| Oba reviewer logins na finalnym buildzie, istniejąca relacja | PENDING |
| Film kompletny, aktualny, dostępny reviewerowi | PENDING |

## Wstrzymanie gotowości

Nie nadawać READY FOR APP REVIEW dopóki macierz nie ma rzeczywistych dowodów, build 10 nie jest wybrany w ASC, odpowiedź na sześć pytań nie jest kompletna, DSA i wymagania regionalne nie są rozstrzygnięte. Odpowiedź Apple, resubmission i wydanie publiczne wymagają osobnego polecenia właściciela.

## What to Test — do zapisania w TestFlight po przetworzeniu builda 10

### PL

Sprawdź NiX 1.0.12 (10). Buildy 8/9 zostały zastąpione; finalne wyniki zapisuj dla builda 10.

Sprawdź czystą instalację i aktualizację, logowanie e-mail/Apple, onboarding 16+, zmianę konta i powrót offline. Na kontrolowanych kontach przetestuj tekst, zdjęcie i krótki film: kamera → podgląd → wysyłka → odbiór → viewer. Sprawdź wznowienie wysyłki po utracie sieci i przejściu w tło, bez duplikatów. Zgłoś testową wiadomość, zablokuj jej nadawcę i usuń oddzielne konto demonstracyjne. Zachowaj konta reviewerów.

Sprawdź powiadomienia nad arkuszami i klawiaturą, tap/swipe, oba motywy, PL/EN, dużą czcionkę, VoiceOver i Reduce Motion. Odmów uprawnień i sprawdź możliwość ponownego wejścia. Zapisuj urządzenie, iOS, build oraz kroki i nagranie błędu. Nie przesyłaj haseł ani prywatnych rozmów w feedbacku.

### EN

Test NiX 1.0.12 (10). Builds 8/9 are superseded; record final results for build 10.

Check clean installation and upgrade, email/Apple sign-in, age-16 onboarding, account switching and offline recovery. With controlled test accounts, test text, photos and a short video: camera → preview → send → receive → viewer. Check upload recovery after network loss and backgrounding, without duplicates. Report a test message, block its sender and delete a separate demonstration account. Preserve the reviewer accounts.

Check notifications above sheets and the keyboard, tap/swipe dismissal, both themes, PL/EN, large text, VoiceOver and Reduce Motion. Deny permissions and check recovery when reopening the screen. Include device, iOS, build, reproduction steps and a recording for failures. Do not include passwords or private conversations in feedback.
