# NiX — bramka wydania do zewnętrznego TestFlight

## Automatyczne

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run check-knip`
- [ ] `npm run expo-doctor`
- [ ] `npm run expo-install-check`
- [ ] `npm run check:ios-config`
- [ ] `npm run check:sentry-disabled`
- [ ] `npm run doctor:react:ci`
- [ ] `npm run doctor:react:changed -- --base main --blocking error --no-score`
- [ ] `npm run export:production`
- [ ] migracja bezpieczeństwa zastosowana; cztery Edge Functions wdrożone i smoke-tested

## Konfiguracja zewnętrzna

- [ ] Expo MCP ponownie uwierzytelniony; buildy/workflow zweryfikowane dla `@mt_hub/nix-app`
- [ ] sekrety produkcyjne Supabase i OAuth ustawione; brak sekretów w repo
- [ ] potwierdzono `SENTRY_RUNTIME_ENABLED=false` oraz wyłączony upload source maps/dSYM
- [ ] publiczny URL polityki prywatności opublikowany i wpisany w App Store Connect
- [ ] App Privacy, rating wieku, eksport compliance i kontakty testowe uzupełnione
- [ ] dwa dedykowane konta reviewera przetestowane według `testflight-test-information.md`

## Fizyczny iPhone

- [ ] czysta instalacja i upgrade
- [ ] Apple, e-mail, logout, deep link oraz QR; Google jest poza zakresem jako nieaktywny stub
- [ ] kamera przód/tył, mikrofon, biblioteka, zdjęcie, wideo, kompresja i upload
- [ ] odmowa każdego uprawnienia oraz ponowne przyznanie w Ustawieniach
- [ ] offline, zmiana sieci, background/resume, realtime i retry
- [ ] report, block, unblock, moderator decision, 30-dniowy cleanup (skrócony TTL w testach)
- [ ] usuwanie konta i weryfikacja usunięcia Storage
- [ ] testowy DSN nie aktywuje breadcrumbów, envelope HTTP ani uploadu symboli
- [ ] smoke w iPhone compatibility mode na iPadzie

## Decyzja

- [ ] ręcznie uruchomiony `.eas/workflows/release.yml`; podpisany build zakończony sukcesem
- [ ] artefakt zainstalowany i zaakceptowany przez QA na urządzeniu
- [ ] identyfikator tego buildu przekazany do `testflight-submit.yml`
- [ ] osoba zatwierdzająca świadomie wybrała `SUBMIT_APPROVED_BUILD`

Do spełnienia wszystkich pozycji status pozostaje **NO-GO**.
