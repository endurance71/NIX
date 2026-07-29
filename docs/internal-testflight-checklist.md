# NiX — zamknięcie roadmapy w Internal TestFlight

> Kanoniczna ścieżka jest kosztowa: lokalny Xcode Archive i upload przez
> Organizer. Nie uruchamiaj płatnego EAS Build ani zewnętrznego Beta Review.

## Źródło wydania

- [x] Bieżący numer to `1.0.5 (8)`; build 7 jest już zapisany jako wysłany.
- [ ] Wszystkie zamierzone zmiany są zacommitowane na dedykowanej gałęzi.
- [ ] Worktree jest czysty, a SHA buildu zapisane w raporcie wydania.
- [x] `.env.production` włącza roadmapę wewnętrzną, ale jawnie wyłącza
      `EXPO_PUBLIC_SHARE_INVITES_ENABLED`.

## Automatyczne bramki

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run deno:check`
- [x] `npm run deno:test`
- [x] `npm run test:supabase-db`
- [x] `npm run check:supabase-migrations`
- [x] `npm run check:supabase-db-lint`
- [x] `npm run check:ios-config`
- [x] `npm run check:internal-testflight-config`
- [x] `npm run check:invite-hosting`
- [x] `npm run check:text-outbox-security`
- [x] `npm run check-knip`
- [x] `npm run expo-install-check`
- [x] `npm run expo-doctor`
- [x] `npm run export:production`
- [x] `npm audit --omit=dev` — 0 podatności

## Backend i hosting

- [x] Zaszyfrowany backup i liczniki sprzed wdrożenia są zapisane poza repo.
- [x] Zdalne migracje obejmują `20260729120000`–`20260729123000`.
- [x] Funkcje `push-dispatch`, `data-export-download` i
      `process-data-exports` mają zatwierdzone wersje i punkt rollbacku.
- [x] Crony eksportów i analityki są aktywne, a kolejki nie narastają.
- [ ] `nix.damianmotylinski.pl` ma DNS, HTTPS, działający landing i AASA bez redirectu
      — odłożone; nie blokuje builda 8, bo zaproszenia `share` są wyłączone.
- [ ] Hosting nie zapisuje pełnych ścieżek `/invite/<token>` — odłożone razem
      z zaproszeniami `share`.
- [ ] Polityka prywatności `2026-07-29` jest publicznie dostępna.

## Podpisany artefakt

- [x] Archiwum `1.0.5 (8)` utworzono lokalnie i przeszło `codesign --verify`.
- [x] Associated Domains zawiera `applinks:nix.damianmotylinski.pl`.
- [ ] Profil dystrybucyjny nadał produkcyjne APNs.
- [x] Bundle ID to `com.damianmotylinski.nixapp`.
- [x] Sentry i upload symboli pozostają wyłączone.
- [ ] Build jest przypisany wyłącznie do `NiX Internal QA`.

Eksport dystrybucyjny builda 8 jest zablokowany lokalnie do czasu ponownego
zalogowania konta Apple w Xcode i pobrania certyfikatu iOS Distribution.
Associated Domains pozostaje w binarium na późniejszy rollout, ale UI,
obsługa linków i realizacja tokenów `share` są w buildzie 8 wyłączone flagą.

## Akceptacja

- [ ] Wszystkie scenariusze z `internal-testflight-what-to-test.md` przeszły na dwóch iPhone’ach.
- [ ] Brak otwartych P0/P1 oraz naruszeń prywatności, autoryzacji i idempotencji.
- [ ] TestFlight Crashes, Xcode Organizer i logi Supabase sprawdzono po 24 i 48 godzinach.

**GO Internal** wymaga wszystkich pozycji. Publiczny App Store i External
TestFlight pozostają poza tym zamknięciem.
