# NiX — zamknięcie roadmapy w Internal TestFlight

> Kanoniczna ścieżka jest kosztowa: lokalny Xcode Archive i upload przez
> Organizer. Nie uruchamiaj płatnego EAS Build ani zewnętrznego Beta Review.

## Źródło wydania

- [x] Bieżący release candidate to `1.0.6 (1)`; poprzedni build `1.0.5 (8)` pozostaje punktem rollbacku.
- [x] Wszystkie zamierzone zmiany są zacommitowane na `release/ios-1.0.6-testflight`.
- [x] Worktree buildu był czysty; SHA RC: `b8e7a64eb7186ead8254d8e1f0150ef1d112f5f0`.
- [x] `.env.production` włącza roadmapę wewnętrzną, ale jawnie wyłącza
      `EXPO_PUBLIC_SHARE_INVITES_ENABLED`.

## Automatyczne bramki

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run deno:check`
- [x] `npm run deno:test`
- [ ] `npm run test:supabase-db` — dedykowany test `profile_bio` przechodzi 4/4,
      ale pełny historyczny zestaw powoduje SIGSEGV lokalnego PostgreSQL 17
      podczas starego testu roadmapy i wymaga ponownej weryfikacji w zgodnym środowisku.
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
      — odłożone; zaproszenia `share` są wyłączone, ale publiczne dokumenty prawne
      nadal blokują dystrybucję `1.0.6 (1)`.
- [ ] Hosting nie zapisuje pełnych ścieżek `/invite/<token>` — odłożone razem
      z zaproszeniami `share`.
- [ ] Polityka prywatności i regulamin `2026-08-01` są publicznie dostępne.

## Podpisany artefakt

- [x] Archiwum `1.0.6 (1)` utworzono lokalnie pod
      `/Volumes/External-drive-lexar/Backups/NiX/archives/NiX-1.0.6-1.xcarchive`;
      `codesign --verify --deep --strict` przechodzi dla podpisu deweloperskiego.
- [x] Associated Domains zawiera `applinks:nix.damianmotylinski.pl`.
- [ ] Profil dystrybucyjny nadał produkcyjne APNs.
- [x] Bundle ID to `com.damianmotylinski.nixapp`.
- [x] Sentry i upload symboli pozostają wyłączone.
- [ ] Build jest przypisany wyłącznie do `NiX Internal QA`.

Archiwum utworzone 1 sierpnia 2026 jest podpisane certyfikatem Apple Development;
ma `aps-environment=development` i `get-task-allow=true`. Test eksportu
`app-store-connect` zakończył się komunikatami `No Accounts` oraz
`No signing certificate "iOS Distribution" found`. Eksport dystrybucyjny jest
zablokowany do czasu ponownego zalogowania konta Apple w Xcode i pobrania
certyfikatu iOS Distribution. Po naprawie podpisu trzeba utworzyć nowe archiwum,
sprawdzić produkcyjne APNs i dopiero wtedy wykonać Validate/Upload w Organizerze.
Associated Domains pozostaje w binarium na późniejszy rollout, ale UI,
obsługa linków i realizacja tokenów `share` są w buildzie `1.0.6 (1)` wyłączone flagą.

## Evidence 2026-08-01

- Produkcyjny backup: zaszyfrowany, test odszyfrowania poprawny; liczniki przed i po
  migracji bez zmian (`auth.users=15`, `profiles=15`, `friendships=6`, `nixes=172`,
  Storage `23`).
- Migracja `20260801120000_profile_bio.sql`: wdrożona i obecna na liście linked;
  nie wdrażano Edge Functions.
- Bramki aplikacji: TypeScript i lint bez błędów, Jest `315/315`, Expo Doctor
  `19/19`, React Doctor `100/100`, Knip i audit bez znalezisk, eksport produkcyjny
  poprawny.
- Unsigned Release i lokalne Archive zakończone poprawnie w Xcode 26.6; artefakt
  potwierdza `1.0.6 (1)` oraz `com.damianmotylinski.nixapp`.
- Status: **NO-GO** do czasu publikacji `/privacy` i `/terms`, podpisu Apple
  Distribution, testów na urządzeniach, Validate/Upload i konfiguracji Internal QA
  w App Store Connect.

## Akceptacja

- [ ] Wszystkie scenariusze z `internal-testflight-what-to-test.md` przeszły na dwóch iPhone’ach.
- [ ] Brak otwartych P0/P1 oraz naruszeń prywatności, autoryzacji i idempotencji.
- [ ] TestFlight Crashes, Xcode Organizer i logi Supabase sprawdzono po 24 i 48 godzinach.

**GO Internal** wymaga wszystkich pozycji. Publiczny App Store i External
TestFlight pozostają poza tym zamknięciem.
