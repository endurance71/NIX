# NiX — pakiet prawny przed publikacją

**Wersja:** 2026-09-05
**Status:** treść zsynchronizowana z in-app (`src/lib/legalDocuments.ts`); wymaga
akceptacji prawnej i publikacji HTTPS.

Ten katalog jest źródłem wersjonowanych treści dla aplikacji i przyszłej strony HTTPS:

- `privacy-policy.pl.md` / `privacy-policy.en.md`
- `terms.pl.md` / `terms.en.md`
- `account-deletion.md`

Publiczny kandydat: analityka produktu i Sentry runtime są jawnie wyłączone flagami
builda. Przed włączeniem analityki zaktualizuj App Privacy (P1-2) i te dokumenty.

Przed publikacją właściciel produktu musi zatwierdzić okresy retencji, regiony,
umowy powierzenia i mechanizmy transferu każdego dostawcy. Następnie identyczną
wersję należy opublikować pod trwałymi adresami
HTTPS, wpisać URL polityki i wsparcia w App Store Connect oraz zaktualizować
deklarację App Privacy.

Nie wprowadzono cookies ani analityki marketingowej. Jeśli zostaną dodane, wymagają
osobnej aktualizacji polityki i, gdy dotyczy strony WWW, mechanizmu zgody.
