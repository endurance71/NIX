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
2. Wdróż `supabase/functions/delete-account` z `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` i `SUPABASE_SERVICE_ROLE_KEY` dostępnymi wyłącznie po
   stronie funkcji.
3. Utwórz konto testowe z mediami jako nadawca i odbiorca, usuń je oraz potwierdź
   brak `auth.users`, rekordów aplikacyjnych i obiektów w bucketach `avatars` oraz
   `media-vault`.
4. Uzupełnij politykę prywatności o zatwierdzone wyjątki retencji przed publikacją.
