# Usunięcie konta NiX

## Dla użytkownika

W aplikacji otwórz **Profil → Konto → Usuń konto**. Wpisz swoją nazwę użytkownika
i potwierdź tożsamość aktualnym hasłem albo przez Sign in with Apple. Operacja jest
nieodwracalna.

Usuwamy konto uwierzytelniania, profil, avatar, relacje, zaproszenia, wiadomości,
metadane i pliki multimedialne powiązane z kontem oraz lokalne kolejki aplikacji.
Jeśli nie możesz zalogować się do aplikacji, napisz na
**kontakt@damianmotylinski.pl**. Weryfikacja tożsamości będzie proporcjonalna do
żądania.

## Dla operatora

1. Zastosuj obie migracje `20260714220500_*` i `20260714221000_*`.
2. Ustaw `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`
   (`com.damianmotylinski.nixapp`) i `APPLE_PRIVATE_KEY` wyłącznie w sekretach
   Supabase, poza Git. Wdróż tylko `delete-account` z `verify_jwt = true`.
3. Kontrolowany test urządzeniowy Sign in with Apple (development/TestFlight)
   jest **otwarty** (P0-4 DEVICE TEST DEFERRED) — nie konta Sandbox IAP.
   Do wykonania: poprawne usunięcie konta Apple, konto bez identity Apple,
   brak kodu, zużyty/błędny kod oraz brak cleanupu przy błędzie Apple.
   Potwierdź puste własne prefiksy mediów i avatarów, zachowanie assetu
   używanego przez innego odbiorcę oraz kwalifikację ostatniego osieroconego
   assetu przez cron. Zapisz dowody bez danych użytkowników.
4. Uzupełnij politykę prywatności o zatwierdzone wyjątki retencji przed publikacją.
