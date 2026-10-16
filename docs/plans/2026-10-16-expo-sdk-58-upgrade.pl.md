# NiX — aktualizacja do Expo SDK 58 (gałąź `expo-58`)

## Kontekst

- Produkcja: **1.0.13 (16)** czeka w App Review (`WAITING_FOR_REVIEW`, wysłane 2026-10-15). `main` = `1ade631`, runtime `1.0.13`, kanał `production`. OTA do `production` tylko przy krytycznym błędzie (recenzent też je pobiera).
- SDK 58 wyszedł 2026-10-15 (`expo@58.0.13`): RN 0.86 → **0.88**, React 19.2.3 → **19.3.0**, SDK iOS 27, **obowiązkowy cykl życia scen UIKit** (aplikacja zbudowana Xcode 27 bez scen może nie wystartować na iOS 27).
- Cel: przygotować SDK 58 na osobnej gałęzi tak, żeby **nic nie dotknęło 1.0.13 w review** i żeby z SDK 58 wyszła nowa binarka **1.1.0** (Ścieżka B — lokalny Xcode Archive). Zero OTA z tej gałęzi.
- Gałąź **`expo-58` jest już utworzona z `main` (`1ade631`)**, bez commitów. Nieśledzony `assets/app-store/` zostaje nietknięty.

## Analiza aplikacji — co SDK 58 rusza w NiX

**Środowisko:** Xcode 27.1 ✓, CocoaPods 1.17 ✓, Node lokalnie 22.22.3 (SDK 58 akceptuje ≥22.13, ale `engines` w repo wymaga 24.x → używać Node ≥24.3). Bare workflow, `ios/` w Git, `buildReactNativeFromSource: true`, cele: NiX + 4 rozszerzenia (Widget, Share, Capture, NotificationService).

**Zależności (różnice wg `bundledNativeModules.json` z expo@58.0.13):**
| Pakiet | Teraz | SDK 58 | Ryzyko |
|---|---|---|---|
| wszystkie `expo-*`, `@expo/ui` | ~57.x | ~58.x | średnie (zmiany niżej) |
| react-native / react | 0.86.3 / 19.2.3 | 0.88.0 / 19.3.0 | wysokie (Strict TS API, usunięte API) |
| react-native-gesture-handler | ~2.32 | **~3.3 (major)** | wysokie — 14 plików, 26× `GestureDetector`, builder `Gesture.*` |
| @sentry/react-native | ~7.11 | **~8.28 (major)** | niskie — Sentry wyłączony (`check:sentry-disabled`), tylko init/breadcrumb/captureMessage w `src/lib/monitoring.ts` |
| react-native-worklets / reanimated | 0.10.1 / 4.5.1 | 0.13.0 / 4.7.1 | średnie |
| @shopify/react-native-skia | 2.6.2 | 2.14.0 | średnie |
| flash-list, safe-area, screens, svg | — | 2.3.2 / 5.10.1 / 4.30 / 15.16 | niskie–średnie |
| Spoza SDK: compressor 1.19.4, image-crop-picker 0.51.1, expo-paste-input 0.2.2, expo-quick-actions 6.0.2, qrcode-svg, async-storage 2.2.0 | | | sprawdzić build z RN 0.88. **Nie** przechodzić na compressor 2.x (wymaga nitro-modules) ani async-storage 3.x w tym kroku |

**Patche (9, 2372 linie) — każdy do ponownej oceny pod nowe wersje:** `react-native+0.86.3` (1041 linii, podspec prebuilt/VFS), `expo-camera` (orientacja, JPEG zamiast HEIC, czarne klatki z przedniej kamery), `react-native-screens` (NOTIF-6: osobne UIWindow dla overlay), `expo-widgets` (Live Activity), `expo-quick-actions` (shortcut z zimnego startu przy scenach — SDK 58 sam przekazuje quick actions przez scenę, patch może być zbędny), `expo-constants`, `expo-image-manipulator` (SharedRef pod ExpoModulesJSI), `react-native-compressor`, `query-string`.

**Natywne iOS (cykl życia scen):**
- NiX już ma sceny z SDK 57 (`enableSceneSupport: true`, `Info.plist` → `EXExpoAppSceneDelegate`). W SDK 58 ta flaga nic nie robi; prebuild generuje `ios/NiX/SceneDelegate.swift` (`class SceneDelegate: ExpoAppSceneDelegate`) i manifest z `$(PRODUCT_MODULE_NAME).SceneDelegate`.
- `ios/NiX/AppDelegate.swift`: nadpisania `open url` i `continue userActivity` wołają `RCTLinkingManager` → w SDK 58 to **podwójne zdarzenia linków** (zaproszenia do znajomych, `nix://auth/callback`). Usunąć zgodnie z upgrade helperem.
- `project.pbxproj`: skrypt „Bundle React Native code and images” czyta `.xcode.env*` z `$SRCROOT/` — zderza się z `plugins/withIosXcodeSpacesInPathFix.js` (ścieżka projektu ma spacje: `External-drive-lexar`… sprawdzić).
- Moduły lokalne: `modules/nix-media-overlay` używa `UIScreen.main.scale` (5 miejsc) → przejść na `traitCollection.displayScale` / scene-aware helper. `nix-camera-torch` i `nix-passkeys` już używają `connectedScenes` (OK, opcjonalnie `Utilities.keyWindow()`). `nix-background-uploader` używa `ExpoAppDelegateSubscriber` (`handleEventsForBackgroundURLSession`) — dalej działa, zweryfikować w teście.
- Rozszerzenia nie używają RN — nie dostają `ExpoAppSceneDelegate` (zgodnie z wytycznymi).

**JS / TS:**
- `src/components/welcome/welcomeMotion.ts:91` — `InteractionManager` **usunięty** w RN 0.88 → `requestIdleCallback` (+ anulowanie przez `cancelIdleCallback`).
- `src/app/_layout.tsx:313` — `initialRouteName` na `<Stack>` **usunięty** w expo-router 58. Kierowanie i tak robi `resolveBootstrapRedirect` (`src/lib/bootstrapPresentation.ts`) → usunąć prop, ewentualnie `unstable_settings = { anchor: '(tabs)' }`; sprawdzić zimny start zalogowany/niezalogowany/onboarding.
- `src/app/(tabs)/inbox/index.tsx:20` — `useNavigation()`: zostawić tylko dla zdarzeń/opcji, nawigację po href przez `useRouter()`.
- `headerTransparent` domyślnie `true` na iOS w router 58 — NiX ustawia go jawnie w większości miejsc; przejrzeć ekrany z `headerShown: true` bez tej opcji (inset przewijania). Czcionki nagłówków już mają `fontFamily: APP_FONT_FAMILY` ✓.
- `@expo/ui`: `HStack`/`VStack` bez `spacing` dostają odstęp systemowy (≈11 miejsc, np. `src/components/inbox/InboxScreenSurface.tsx`, `src/components/ui/native-settings.tsx`, `src/widgets/InboxWidget.tsx`) → dodać `spacing={0}` tam, gdzie układ na tym polega; `<Host>` wyrównuje do góry; `strokeBorder({ color })` w `src/components/ui/otp-code-field.tsx:82` → `content` (deprecation).
- `expo-notifications`: banery na pierwszym planie domyślnie włączone — `setNotificationHandler` w `src/context/PushNotificationsProvider.tsx:51` już decyduje jawnie ✓ (zweryfikować tłumienie w otwartym czacie).
- `expo-file-system`: NiX używa wyłącznie `expo-file-system/legacy` → zmiana `File.write()` na async nie dotyczy. `expo-sqlite` bez libSQL ✓. Lokalizacja bez RTL ✓.
- RN Strict TypeScript API domyślnie: brak głębokich importów `react-native/Libraries` w `src/` ✓, ale typy refów (`ViewInstance`) wyjdą w `npm run typecheck`.
- RNGH 3: hooki (`usePanGesture`…) są nowym API, zmiany nazw callbacków (`onStart→onActivate`, `onEnd→onDeactivate`, `onChange` usunięty). Najpierw sprawdzić, czy builder `Gesture.*` w 3.3 jest tylko przestarzały — jeśli tak, migracja na hooki to osobne zadanie po SDK 58; jeśli usunięty — migracja 14 plików w tej gałęzi (viewer, preview, kamera, swipe-to-reply, powiadomienia).
- `NODE_ENV` ustawiane przez CLI → sprawdzić `.env*` i `scripts/validate-release-env.mjs` / `export:production`.

**Wersjonowanie OTA:** `runtimeVersion` to stały string `1.0.13` → **musi** zmienić się na `1.1.0` (wraz z `version`), inaczej OTA dla 1.0.13 trafiłyby do binarki SDK 58 i odwrotnie. Nowe domyślne fingerprint `balanced` nie dotyczy (brak polityki fingerprint).

## Plan wykonania (na gałęzi `expo-58`, małe commity)

0. **Zabezpieczenia** — zapisać ten plan jako `docs/plans/2026-10-16-expo-sdk-58-upgrade.pl.md`; kopia `ios/` + `Podfile.lock` do `~/.nix-ops/sdk58-backup/`; Node ≥24.3 (`nvm use 24`). Żadnego `eas update`/`eas build` z tej gałęzi.
1. **Zależności** — `npx expo install expo@^58.0.0 --fix`, potem `npx expo install` dla majorów (RNGH 3, Sentry 8, worklets, reanimated, skia, flash-list, `@types/react ~19.3`, `eslint-config-expo ~58`); sprawdzić `react-native-image-crop-picker@0.52`, `expo-paste-input`, `expo-quick-actions`. Podbić pin `expo-doctor` w `package.json`.
2. **Patche** — dla każdego z 9: czy poprawka jest już w nowej wersji → usunąć; jeśli nie → przenieść ręcznie i wygenerować `patch-package` pod nową wersję. Kolejność wg ryzyka: react-native, expo-camera, react-native-screens, expo-widgets, expo-quick-actions, reszta. `npm install` bez błędów patchy.
3. **Natywne iOS** — `npx expo prebuild --platform ios --no-install` w **kopii roboczej** (scratch), diff z `ios/`, przeniesienie tylko zmian SDK: `SceneDelegate.swift` (+ wpisy w pbxproj), `Info.plist` (delegat sceny), `AppDelegate.swift` (bez `RCTLinkingManager` i ręcznego okna), ścieżki `.xcode.env` w skrypcie bundla (zgodność z `withIosXcodeSpacesInPathFix.js`), usunięcie `enableSceneSupport` z `app.json`. `UIScreen.main` w `nix-media-overlay`. `cd ios && pod install --repo-update`. `npm run check:ios-config`.
4. **JS** — `InteractionManager`, `initialRouteName`, `useNavigation`, `@expo/ui` spacing/Host/strokeBorder, nagłówki, ewentualna migracja RNGH (wg wyniku sprawdzenia z analizy), błędy Strict TS z typecheck.
5. **Narzędzia i dokumentacja** — linki `docs.expo.dev/versions/v57` → v58 (AGENTS.md, `docs/`), wzmianki „SDK 57/RN 0.86” w `AGENTS.md`, `docs/native-platform-guidelines.md`, `docs/development-workflow.md`; `generate-router-types.mjs`, knip, mocki vitest pod RN 0.88. Expo Modules 2.0 (beta) — **nie migrować** w tym kroku.
6. **Wersja** — `version` i `runtimeVersion` → `1.1.0`, `buildNumber` → `17` (dopiero przed Archive, w osobnym commicie).
7. **Wydanie** — dopiero po decyzji App Review dla 1.0.13: PR `expo-58` → `main`, Archive Release lokalnie, wyłącznie wewnętrzny TestFlight (NiX Internal QA), wpis w `docs/release/ios-current.md`. Gdy Apple odrzuci 1.0.13 i trzeba hotfixa — robić go na `main` (SDK 57), nie tutaj.

## Weryfikacja

- `npm run lint && npm run typecheck && npm test`, `npm run check-knip`, `npm run expo-doctor`, `npm run expo-install-check`, `npm run check:ios-config`, `npm run check:release-env`, `npm run check:sentry-disabled`, `npm run doctor:react:changed`.
- Debug build na symulatorze iOS 27 (XcodeBuildMCP `build_run_sim`), potem Release Archive lokalnie (ARCHIVE SUCCEEDED, 4 rozszerzenia, tylko tryb tła `processing`, manifesty prywatności).
- Smoke na urządzeniu (light + dark, VoiceOver): zimny start zalogowany/wylogowany/onboarding; sign-in Apple, OTP z autouzupełnianiem, passkeys; kamera (przód/tył, flash, wideo, latarka, skan QR); podgląd z gestami (filtry, naklejki, tekst), viewer (swipe-down), swipe-to-reply; upload w tle po zabiciu aplikacji + Live Activity + widget; share extension i Capture extension (ekran blokady); push + NotificationService + banery w aplikacji nad arkuszami (patch screens); quick actions z zimnego startu; linki `nix://` i universal links zaproszeń — **jedno** zdarzenie; paste w czacie; native tabs z badge i awatarem; bottom sheet; pamięć Hermes przy reanimated (regresja z SDK 57 < 57.0.9).
