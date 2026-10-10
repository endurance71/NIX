# NiX — punkt wejścia dla agentów (Claude Code, Codex, Cursor)

NiX to aplikacja **iOS-only** na Expo SDK 57 (bare workflow, `ios/` w repo), React Native 0.86, `@expo/ui`, Expo Router, Reanimated 4, Supabase (Postgres + Edge Functions w Deno). Ten plik jest zawsze w kontekście — trzyma twarde zasady i mapę „cel → źródło prawdy”. Szczegóły są w `docs/`; przy sprzeczności wygrywa wskazany dokument.

## Twarde zasady (zawsze)

1. **Deploy cost-first** (`docs/DEPLOY_IOS_TESTFLIGHT.md`): nigdy `eas build` ani `eas submit` bez jawnej prośby. Tylko JS/assets → `eas update --channel production`; zmiany native / SDK / plugins / entitlements / `runtimeVersion` → lokalny Xcode Archive. Przy niepewności „czy native?” → Xcode, nie OTA. Przed każdym wydaniem sprawdź aktualny stan w `docs/release/ios-current.md` (może blokować OTA dla danego runtime). OTA trafia do wszystkich testerów — publikuj tylko po potwierdzeniu użytkownika.
2. **Native-first UI** (`docs/native-platform-guidelines.md`): `@expo/ui` (universal) → `@expo/ui/swift-ui` → moduły Expo → RN primitives tylko jako wyjątek. Zakazane: Paper, NativeBase, `@expo/vector-icons`, legacy `Animated` / `LayoutAnimation`. Ikony tylko SF Symbols przez `AppIcon` (`src/theme/app-icons.ts`).
3. **Motyw**: kolory wyłącznie z `useAppTheme()` — bez hardcoded hexów poza `src/theme/` (`docs/theme-guidelines.md`).
4. **i18n**: każdy nowy tekst UI jako klucz w `src/lib/i18n.ts` dla **pl i en** (`docs/i18n-guidelines.md`).
5. **Zależności**: instaluj przez `npx expo install <pkg>` (nie `npm install`) — pilnuje wersji zgodnych z SDK. Nowy moduł natywny = zmiana native (patrz zasada 1).
6. **Supabase**: zmiany schematu tylko jako nowa migracja w `supabase/migrations/` (nie edytuj istniejących). Nową migrację dopisz do listy `expected` w `scripts/check-supabase-migrations.mjs`, potem `npm run check:supabase-migrations`. Prywatne dane per użytkownik → osobna tabela z RLS, nie kolumna we współdzielonym wierszu.

## Mapa: cel → od czego zacząć

Skille z wtyczki `expo` i wybrane skille użytkownika są włączone dla tego projektu w `.claude/settings.json`. **Przy konflikcie wygrywają zasady z tego pliku i `docs/`** — np. skille EAS opisują `eas build`/`eas submit`/workflows, a NiX buduje binary lokalnie (zasada 1). Skille połączone `+` ładuj **oba**, zanim zaczniesz pisać kod — sam fakt, że w projekcie jest podobny komponent, nie zwalnia z ich załadowania. Gdy zadanie zmienia się w trakcie (np. z UI na dane), wróć do tej mapy i załaduj kolejny skill.

| Cel | Przeczytaj najpierw | Skill | Sprawdź / uruchom |
| --- | --- | --- | --- |
| Nowy ekran / zmiana UI | `docs/native-platform-guidelines.md`, `docs/theme-guidelines.md`, `docs/i18n-guidelines.md` | `expo-ui` **+** `expo-native-ui` (razem), `react-native-best-practices` | `npm run typecheck`, `npm run doctor:react:changed` |
| Nawigacja / nowe trasy | `docs/native-platform-guidelines.md` (NativeTabs) | `expo-router` | `npm run typecheck` |
| Animacje / gesty | `docs/native-platform-guidelines.md` | `expo-animation` | jw. |
| Formularze auth | `docs/development-workflow.md` (sekcja `@expo/ui`), `docs/auth-flow.md` | `expo-ui` | jw. |
| Dostępność (VoiceOver, Dynamic Type) | `docs/native-platform-guidelines.md` | `ios-accessibility` | — |
| Pobieranie danych / cache | `src/services/` | `expo-data-fetching` | `npm test` |
| Wydanie / hotfix do testerów | `docs/release/ios-current.md`, `docs/DEPLOY_IOS_TESTFLIGHT.md`, `docs/internal-testflight-release-runbook.md` | `eas-update` (tylko Ścieżka A) | `npm run check:ios-config`, `npm run check:release-env` |
| Upgrade SDK / nowy moduł natywny | `docs/DEPLOY_IOS_TESTFLIGHT.md` (Ścieżka B) | `expo-upgrade`, `expo-module` | `npm run expo-doctor`, `npm run expo-install-check` |
| Upload mediów / wideo | `docs/durable-media-upload-runbook.md`, `docs/video-pipeline.md` | `systematic-debugging` (przy błędach) | `npm test` |
| Baza / RLS / Edge Functions | `supabase/migrations/`, `docs/cleanup-edge-function.md` | `supabase` **+** `supabase-postgres-best-practices` | `npm run check:supabase-migrations`, `npm run deno:check`, `npm run test:supabase-db` |
| Moderacja / zgłoszenia | `docs/moderation-policy.md`, `docs/moderation-runbook.md` | — | `npm run check:report-content-contract` |
| Powiadomienia push | `docs/push-notifications.md` | — | — |
| Obserwowalność / Sentry | `docs/observability.md` | — | `npm run check:sentry-disabled` |
| App Store Review | `docs/APP_STORE_REVIEW_AUDIT_2026-08-31.md`, `docs/release/ios-current.md` | `app-store-review` | — |
| Bug / nieoczekiwane zachowanie | — | `systematic-debugging` | test reprodukujący |
| Przygotowanie PR | `docs/development-workflow.md` (lista „Przed PR”) | — | lint, typecheck, test, knip, expo-doctor |

## Przed oddaniem pracy

`npm run lint && npm run typecheck && npm test` — a przy zmianach UI także smoke na iOS (light + dark). Pełna lista: `docs/development-workflow.md`.

## Ewaluacja instrukcji dla agentów

Zmiany w tym pliku, w `docs/` używanych przez agentów lub w zestawie skilli mierz harnessem `scripts/agent-evals/` (instrukcja: `scripts/agent-evals/README.md`) — nie „na oko”.
