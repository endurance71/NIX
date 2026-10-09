# NiX 1.0.12 (9) — finalne QA i nagranie

**Wynik: PENDING.** Backend smoke i CI PASS nie zastępują QA finalnej aplikacji z TestFlight. Historyczne potwierdzenie kamery na buildzie development nie jest dowodem dla IPA 9.

## Identyfikacja

- Instalacja: TestFlight → NiX Internal QA → **1.0.12 (9)**. Nie wybierać 7 ani 8.
- Runtime 1.0.12, kanał production; nie publikować OTA w trakcie QA.
- Podpisane IPA builda 9 SHA256: `41a4b7961b18c1a8b9634a45083b4994ae61da61182c4c78302d0195a5bd0c2f`. Zachowane z pakietu podpisanego przez Organizer; upload i identyfikacja przetworzonego builda w ASC nadal pending.
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

Release build 9 skompilował się, zainstalował i uruchomił na odrębnym symulatorze iPad Pro 13 (M5), iOS 27.0. Jest to dowód kompilacji i startu; nie potwierdza czytelności, zgodności interakcji ani pełnego flow aplikacji. Kontrola obrazu została zatrzymana przez blokadę Maca. Nie jest to fizyczny artefakt TestFlight ani film wymagany przez Apple.

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
| iPhone bez wyspy; iPad w trybie zgodności | PENDING |
| Sieć IPv6/NAT64 | PENDING |
| Oba reviewer logins na finalnym buildzie, istniejąca relacja | PENDING |
| Film kompletny, aktualny, dostępny reviewerowi | PENDING |

## Wstrzymanie gotowości

Nie nadawać READY FOR APP REVIEW dopóki macierz nie ma rzeczywistych dowodów, build 9 nie jest wybrany w ASC, odpowiedź na sześć pytań nie jest kompletna, DSA i wymagania regionalne nie są rozstrzygnięte. Odpowiedź Apple, resubmission i wydanie publiczne wymagają osobnego polecenia właściciela.
