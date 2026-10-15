# Nagranie dla Apple (2.1): scenariusz na fizycznym iPhonie, 2026-10-15

Apple 13.09 poprosił o nagranie z **fizycznego urządzenia** (2.1 Information Needed). Nagrywamy na iPhonie
właściciela, wyłącznie na kontach testowych, bez prywatnych danych. Drugą osobą w rozmowie jest konto
`dejmien` („Dejmien”) na symulatorze „NiX Shots A” na Macu. Hasła i kody z maila wpisuje tylko właściciel.

## Role

| Urządzenie | Konto | Kto obsługuje |
| --- | --- | --- |
| iPhone właściciela (nagrywany) | **nowe konto Demo**, zakładane na nagraniu i usuwane na końcu | właściciel |
| Symulator „NiX Shots A” (Mac) | `dejmien` / „Dejmien”, istniejące | Claude (stuknięcia), właściciel (hasło) |

Konta reviewerów z App Store Connect nie biorą udziału w nagraniu i zostają nietknięte.

## Przygotowanie (przed włączeniem nagrywania)

1. **Adres e-mail dla konta Demo.** Potrzebna jest skrzynka, do której masz dostęp, inna niż
   `kontakt@damianmotylinski.pl`, bo na tym adresie jest już `dejmien`. Na przykład osobny adres w domenie albo
   Gmail z dopiskiem `+nixdemo`. Na nagraniu ma się pojawić tylko ten adres.
2. **NiX na iPhonie.** Uruchom aplikację dwa razy, żeby pobrała OTA 49. W Profilu zanotuj wersję i build.
   Wyloguj się ze swojego konta: Profil → Wyloguj. Po nagraniu zalogujesz się z powrotem.
3. **Tryb Skupienie → Nie przeszkadzać** na iPhonie, żeby w filmie nie pojawiły się powiadomienia
   z innych aplikacji. Powiadomienia NiX możesz zostawić. Ustaw jasność na wysoką i zamknij inne aplikacje.
4. **Centrum sterowania → Nagrywanie ekranu.** Jeśli nie ma go w Centrum sterowania, dodaj je w Ustawieniach.
   Mikrofon wyłączony.
5. **Symulator A.** Claude uruchamia NiX, a Ty logujesz się jako `dejmien` (wpisujesz hasło).
6. **Ustawienia → Ogólne → Informacje.** Zanotuj model iPhone'a i wersję iOS (potrzebne do odpowiedzi dla Apple).

## Scenariusz nagrania (około 6–8 minut, jedno ciągłe nagranie)

Mów lub rób krótkie pauzy (1–2 s) na każdym ekranie, żeby reviewer zdążył przeczytać.

**A. Start i wersja (iPhone)**
1. Włącz nagrywanie ekranu.
2. Ustawienia → Ogólne → Informacje: pokaż model i wersję iOS (2–3 s). Wróć na ekran główny.
3. Uruchom NiX od zera: przesuń aplikację w przełączniku w górę i otwórz ją ponownie. Widać ekran logowania.

**B. Rejestracja, wiek 16+, onboarding (iPhone)**
4. „Zarejestruj się” → e-mail Demo, hasło, **data urodzenia w kalendarzu** (wiek 16+), zaakceptuj Regulamin
   i Politykę prywatności → „Zarejestruj”.
5. Ekran „Potwierdź e-mail” → wpisz 6 cyfr z maila. Jeśli iOS podsunie kod nad klawiaturą, użyj go.
6. Krok profilu: nazwa wyświetlana `Demo`, nazwa użytkownika np. `nix_demo` → Dalej.
7. Powitanie (krótki przewodnik): przejdź je do końca. Na prośbę o powiadomienia możesz wybrać „Pozwól”.
8. **Logowanie:** Profil → Wyloguj → zaloguj się ponownie e-mailem i hasłem Demo (pokazuje logowanie).

**C. Znajomy (iPhone + symulator)**
9. iPhone: Profil → Znajomi → „Dodaj znajomego” → wpisz `@dejmien` → „Wyślij zaproszenie”.
10. Symulator A (Dejmien): Claude przyjmuje zaproszenie („Przyjmij”).
11. iPhone: pokaż listę znajomych z Dejmienem i otwórz rozmowę.

**D. Rozmowa: tekst, zdjęcie, film (iPhone ↔ symulator)**
12. iPhone: wyślij wiadomość tekstową, np. „Cześć! To jest test NiX dla App Review.”
13. iPhone: aparat → zrób zdjęcie neutralnego przedmiotu (biurko, kubek) → wyślij do Dejmiena.
    Pokaż status wysyłki i weryfikacji, a potem „Wysłano”.
14. iPhone: aparat → nagraj 3–5 s filmu → wyślij do Dejmiena.
15. Symulator A: Claude odsyła tekst i zdjęcie do Demo, żeby był odbiór na iPhonie.
16. iPhone: pokaż odebraną wiadomość i otwórz odebrany NiX w przeglądarce (viewer).
    Uwaga: NiX-y są domyślnie chronione przed zrzutami i nagrywaniem ekranu. Zanim otworzysz NiX, Dejmien
    musi zezwolić Demo na zrzuty (symulator: Znajomi → Demo → „Zrzut ekranu i zapis”). Robimy to przed
    nagraniem tego kroku, inaczej viewer na filmie będzie czarny. W odpowiedzi dla Apple opisujemy, że to
    zgoda nadawcy dla tej jednej relacji, a nie wyłączenie ochrony.

**E. Zgłoszenie i blokada (iPhone)**
17. W rozmowie przytrzymaj odebraną wiadomość od Dejmiena → „Zgłoś wiadomość” → wybierz powód → pokaż
    potwierdzenie „Wiadomość została zgłoszona do moderacji.”
18. Przytrzymaj odebranego NiX-a w czacie → „Zgłoś NiX-a” → powód → potwierdzenie (nowa funkcja z OTA 46).
19. Menu w nagłówku rozmowy → „Zablokuj” → potwierdź. Pokaż, że rozmowa jest zablokowana i nie da się
    wysłać wiadomości.

**F. Usunięcie konta (iPhone)**
20. Profil → Konto → „Usuń konto” → wpisz hasło Demo, a w polu potwierdzenia nazwę użytkownika (`nix_demo`)
    lub e-mail Demo → „Usuń konto”. Pokaż ekran końcowy (powrót do logowania).
21. Zatrzymaj nagrywanie.

## Po nagraniu

1. Obejrzyj film. Sprawdź, czy nie widać prywatnych danych, powiadomień z innych aplikacji ani czarnych ekranów.
2. Wyłącz Nie przeszkadzać i zaloguj się w NiX na swoje konto.
3. Symulator A: `dejmien` ma po nagraniu zablokowane konto Demo, które i tak zostało usunięte. Nic więcej
   nie trzeba robić.
4. Film przekazujemy w odpowiedzi w Resolution Center jako link dostępny bez logowania (np. iCloud Drive lub
   Google Drive z dostępem przez link) albo jako załącznik. Uzupełniamy szkic
   `docs/release/apple-review-response-draft-2026-10-08.en.md` o model, iOS, build, datę i znaczniki czasu
   sekcji A–F. Wysyłka odpowiedzi wymaga zgody właściciela.

## Próba generalna

Przed właściwym nagraniem przejdź kroki 9–19 bez nagrywania na tym samym koncie Demo albo na osobnym
koncie próbnym (usuń je potem). Kroki 4–8 i 20 wymagają nowego konta, więc w nagraniu powstaje nowe Demo.
