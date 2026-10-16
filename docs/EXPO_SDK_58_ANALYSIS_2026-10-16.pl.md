**NiX — analiza migracji na Expo SDK 58, 16 października 2026**

Analizowany commit: `1ade631` (`main`, kandydat do App Review 1.0.13 (16) w stanie WAITING_FOR_REVIEW). Źródło zmian: [changelog Expo SDK 58](https://expo.dev/changelog/sdk-58), [przewodnik po scene lifecycle](https://expo.fyi/ios-scene-lifecycle), [migracja Expo Router 57 → 58](https://docs.expo.dev/router/migrate/sdk-57-to-58/), pliki `CHANGELOG.md` pakietów w `node_modules` oraz próbny upgrade wykonany lokalnie na gałęzi `upgrade/expo-sdk-58`. Ten dokument niczego nie zmienia w aplikacji ani w wydaniu.

Dowody mają trzy poziomy, jak w poprzednich audytach: **wykonanie** — wynik uruchomionego polecenia; **kod** — prześledzona ścieżka w repozytorium; **ryzyko** — wymaga testu na urządzeniu z iOS (nie da się go zrobić w środowisku Linux bez Xcode).

## 1. Wnioski

1. **Migracja jest wykonalna, ale nie jest „bumpem wersji”.** Po podniesieniu zależności: 56 błędów TypeScript w 20 plikach, 5 z 9 patchy `patch-package` nie nakłada się, lint ma 5 błędów, a bez jednej poprawki w `tsconfig.json` nie uruchamia się żaden z 165 plików testów (wykonanie). Po tej poprawce wszystkie 1162 testy przechodzą, a `expo-doctor` zgłasza 19/19.
2. **Dwa błędy nie dają błędu kompilacji, a psują działanie w runtime:**
   - `File.write()` jest teraz asynchroniczne. `src/services/memoriesStore.ts:136` zapisuje indeks Wspomnień bez `await` i od razu robi `move()` — na SDK 58 grozi to uszkodzeniem lub utratą indeksu Wspomnień (kod).
   - `InteractionManager` został usunięty z React Native — `src/components/welcome/welcomeMotion.ts:91` rzuci `TypeError` przy animacjach welcome tour (TypeScript to łapie, ale łatwo to zbagatelizować jako „tylko typy”).
3. **iOS natywnie wymaga ręcznej pracy.** NiX ma `ios/` w repo (bare). Już dziś działa na scene lifecycle (`enableSceneSupport` + `EXExpoAppSceneDelegate`), więc najtrudniejsza część jest za wami, ale trzeba: dodać `SceneDelegate.swift`, zmienić `UISceneDelegateClassName`, usunąć ręczne wywołania `RCTLinkingManager` z `AppDelegate.swift` (w SDK 58 dublują zdarzenia) i odtworzyć 4 patche natywne (piąty, `expo-constants`, jest już zbędny). Patch `expo-widgets` jest blokerem builda: bez niego nie kompiluje się `nix-background-uploader` (sekcja 7). **Nie uruchamiajcie `expo prebuild` na `ios/`** — świeży prebuild przywraca tryb tła `fetch`, usunięty specjalnie dla App Review w buildzie 15 (wykonanie, sekcja 5).
4. **Wydanie:** SDK 58 to zmiana native → nowy `runtimeVersion` (np. `1.1.0`) i lokalny Xcode Archive (Ścieżka B). OTA z tej gałęzi nigdy nie może trafić do runtime `1.0.13`.
5. **Rekomendacja czasowa:** `main` zostaje na SDK 57 do decyzji App Review (hotfixy OTA tylko z `main`). Migracja na `upgrade/expo-sdk-58`, regularnie scalana z `main`. Wydanie SDK 58 jako 1.1.0 po akceptacji 1.0.13 i po pełnym smoke teście na urządzeniu. Szacuję 3–5 dni pracy + 1–2 dni testów na urządzeniu.

## 2. Co zostało uruchomione

Node 24.18.0 (zgodnie z `.nvmrc`), npm 11.16.0.

| Krok | SDK 57 (`main`) | SDK 58 (próba) |
| --- | --- | --- |
| `npm ci` / `npm install` | OK, 9/9 patchy | lockfile trzeba było wygenerować od nowa (konflikt peer `expo-router@58` ↔ `expo-symbols`); **5/9 patchy nie nakłada się** |
| `npm run typecheck` | 0 błędów | **56 błędów w 20 plikach** |
| `npx vitest run` | 165/165 plików, 1162 testy | **0/165** (`Failed to load tsconfig 'expo/tsconfig.base'`); po poprawce `tsconfig.json`: 165/165, 1162 testy |
| `npm run lint` | 0 | **5 błędów** (`import/namespace`, `Notifications.IosAuthorizationStatus`) |
| `npx expo-doctor@latest` | — | 19/19 |
| `npx expo install --check` | — | „Dependencies are up to date” |
| `npm run audit:reviewed` | — | gate przechodzi (24 znane zgłoszenia) |
| `npx expo prebuild --platform ios` (kopia w katalogu tymczasowym) | — | OK, porównanie z `ios/` w sekcji 5 |

Pełne polecenia do odtworzenia próby są w sekcji 9.

## 3. Wersje

Najważniejsze zmiany (pełna mapa: `bundledNativeModules.json` z `expo@58.0.13`).

| Pakiet | Teraz | SDK 58 | Uwagi |
| --- | --- | --- | --- |
| `expo` | 57.0.27 | 58.0.13 | pakiet dostał mapę `exports` (patrz 4.10) |
| `react-native` | 0.86.3 | **0.88.0** | strict TypeScript API, usunięte API (4.2–4.3) |
| `react` / `react-dom` | 19.2.3 | 19.3.0 | `@types/react` → ~19.3 |
| `react-native-gesture-handler` | 2.32 | **3.3.0** | major; stare API `Gesture.*()` działa, ale jest `@deprecated` |
| `@sentry/react-native` | 7.11 | **8.28** | major; w produkcji Sentry jest wyłączony i podmieniany stubem w Metro |
| `@shopify/react-native-skia` | 2.6.2 | 2.14.0 | `SkPath` bez metod mutujących (4.7) |
| `react-native-reanimated` / `worklets` | 4.5.1 / 0.10.1 | 4.7.1 / 0.13.0 | |
| `react-native-screens` | 4.26 | 4.30 | patch nakłada się z ostrzeżeniem o wersji |
| `react-native-safe-area-context` | 5.7 | 5.10.1 | |
| `@shopify/flash-list` | 2.0.2 | 2.3.2 | |
| `@expo/ui` | 57.0.22 | 58.0.20 | zmiana `Host`, `spacing`, `frame()` (4.4, 6.1) |
| `expo-router` | 57.0.25 | 58.0.22 | przebudowany rdzeń nawigacji (4.6, 6.3) |
| `expo-camera` | 57.0.6 | 58.0.10 | soczewki: `LensInfo` i `deviceType` (4.5) |
| `expo-notifications` | 57.0.22 | 58.1.5 | domyślne pokazywanie w foreground |
| `expo-widgets` | 57.0.23 | 58.0.20 | Live Activities: `staleDate`, stabilne identyfikatory |

Pakiety spoza SDK: `expo-quick-actions` 6.0.2 (nowszej wersji nie ma, patch się nakłada), `expo-paste-input` 0.2.2 (bez zmian), `react-native-compressor` 1.19.4 (2.x wymaga `react-native-nitro-modules` — zostańcie na 1.x i sprawdźcie build na RN 0.88), `react-native-image-crop-picker` 0.51.1 (jest 0.52.0).

Node: SDK 58 wymaga 22.13+, 24.3+ lub 26+. Wasze 24.18.0 jest OK.

## 4. Zmiany wymagane w kodzie (blokujące)

### 4.1 `File.write()` jest asynchroniczne — utrata danych bez błędu kompilacji

`expo-file-system` 58: `write(): Promise<void>`, stare zachowanie to `writeSync()`. Tylko jedno wywołanie w aplikacji używa tej metody bez `await`:

- `src/services/memoriesStore.ts:136` — `temporary.write(sealed); temporary.move(...)`. Zmienić na `await temporary.write(sealed)` (funkcja jest już `async`) albo `writeSync`.

Warto dodać regułę `@typescript-eslint/no-floating-promises` (przynajmniej dla `src/services/`), bo ta klasa błędów nie daje błędu typów.

### 4.2 Usunięte API React Native 0.87/0.88

- `InteractionManager` → `requestIdleCallback`: `src/components/welcome/welcomeMotion.ts:2,91`.
- `unstable_batchedUpdates` ma teraz wymagany drugi argument; w React 18+ batching jest automatyczny, więc wywołania można po prostu usunąć: `src/hooks/useViewerScreen.ts:473,514,539,620,698,724`.
- Nie używacie: `Touchable` z roota, typów `NativeMethods`, `Modal animated`, usuniętych propsów `StatusBar`, `ImageBackground` (deprecated), deep importów `react-native/Libraries/*` (kod).

### 4.3 Strict TypeScript API (RN 0.87) — refy jako typy instancji

`useRef<View>(null)` / `useRef<TextInput>(null)` typuje teraz ref jako komponent, a nie instancję. Większość z 56 błędów (ok. 35, razem z wtórnymi `implicit any` w callbackach `measureInWindow`) ma tę jedną przyczynę. Poprawka: `useRef<ViewInstance>(null)`, `TextInputInstance`, `ScrollViewInstance` itd. ([przewodnik](https://reactnative.dev/docs/strict-typescript-api#migration-guide)).

Pliki: `ChatScreenSurface.tsx` (18 błędów), `useCameraScreen.ts`, `usePreviewTextStickerController.ts`, `MessageOverlay.tsx`, `MessageActionMenu.tsx`, `MemoryViewerScreen.tsx`, `PreviewTextStickerContent.tsx`, `ViewerReplyField.tsx`.

Tymczasowe wyjście awaryjne: `"customConditions": ["react-native", "react-native-legacy-deep-imports"]` w `tsconfig.json`. Opcja zniknie po RN 0.89, więc lepiej poprawić typy od razu.

Pokrewne: `AppState.currentState` ma teraz typ `string | null | undefined` — `src/hooks/useAppStateSnapshot.ts:10`, `src/lib/supabase.ts:95`.

### 4.4 `@expo/ui` — `frame()` ma dwa rozłączne warianty

`frame()` przyjmuje albo `{ width, height }`, albo `{ minWidth, maxWidth, minHeight, … }`. Mieszanie (np. `frame({ width: contentWidth, minHeight: 44 })`) to błąd typów. Rozbić na dwa modyfikatory: `frame({ width })`, `frame({ minHeight: 44 })`.

Miejsca: `login-actions-section.tsx:39`, `login-credentials-section.tsx:80`, `accent-appearance-preview.tsx:51`, `auth-form-layout.tsx:133,353,372`, `native-preview-send-button.tsx:70`, `preview-duration-menu.tsx:61`, `ViewerReplyField.tsx:177`.

Deprecated (jeszcze działa): parametr `color` w `strokeBorder` → `content` (`src/components/ui/otp-code-field.tsx:82`).

### 4.5 `expo-camera` — soczewki

`getAvailableLensesAsync()` i `onAvailableLensesChanged` zwracają `LensInfo[]` zamiast `string[]`, a `selectedLens` przyjmuje stabilny `deviceType` (np. `AVCaptureDeviceTypeBuiltInUltraWideCamera`) zamiast zlokalizowanej nazwy. To dobra zmiana, bo nazwy były zależne od języka urządzenia. Do przepisania: `buildLensSwitcherOptions` i `lensOptionsFromNativePresets` (`src/hooks/useCameraScreen.ts:656,678`), stan `selectedLens: string | null` (`:140`) oraz testy przełącznika soczewek. Trzeba też sprawdzić, czy `nix-camera-torch` i patch `expo-camera` nie zakładają starych nazw.

### 4.6 Expo Router — `initialRouteName` na roocie

`src/app/_layout.tsx:313` — `<Stack initialRouteName={session && !needsOnboarding ? '(tabs)' : '(auth)'}>` nie kompiluje się (prop usunięty). Zamiennik `unstable_settings.anchor` jest statyczny, więc dla gatingu sesji właściwym wzorcem jest `Stack.Protected guard={…}` dla `(tabs)` i `(auth)`. To dotyka logiki bootstrapu (`resolveBootstrapRedirect`, `usePendingFriendInviteRedirect`), więc wymaga testów logowania, wylogowania, onboardingu i zaproszeń z linku.

### 4.7 Skia — `SkPath` bez mutacji

`src/components/camera/CameraCaptureSurface.tsx:330` — `path.addCircle(...)` na `Skia.Path.Make()`. W 2.14 metoda jest na `SkPathBuilder` (`Skia.PathBuilder.Make().addCircle(...).build()` — do potwierdzenia w docs Skia). Sprawdzić też `NotificationGoo.tsx` (typecheck go nie zgłosił).

### 4.8 Lint — `Notifications.IosAuthorizationStatus`

`src/services/pushNotificationService.ts:61-66` — `import/namespace` nie widzi enuma po przebudowie `expo-notifications` (enum nadal jest eksportowany w `build/index.js` i `.d.ts`, więc to fałszywy alarm reguły). Najprościej: `import { IosAuthorizationStatus } from 'expo-notifications'`.

### 4.9 Patche `patch-package`

Szczegóły w sekcji 7. Bez odtworzenia patcha `expo-widgets` nie skompiluje się `nix-background-uploader`.

### 4.10 `tsconfig.json`

Pakiet `expo` ma od 58 mapę `exports`. `"extends": "expo/tsconfig.base"` (bez rozszerzenia) dalej działa w `tsc`, ale nie w vitest/oxc — padają wszystkie testy. Zmienić na `"extends": "expo/tsconfig.base.json"` (wykonanie: po tej zmianie 1162/1162).

### 4.11 Konfiguracja

- `app.json` → `expo-build-properties.ios.enableSceneSupport`: usunąć (w SDK 58 to no-op; prebuild ostrzega).
- `runtimeVersion`: nowa wartość (np. `1.1.0`) razem z `version`/`buildNumber`.
- `package.json` → `expo-doctor` jest przypięty do `1.20.4`; podnieść do wersji dla SDK 58.
- `package.json` → `allowScripts`: dopisać `@sentry/cli@3.x` (npm ostrzega o niezatwierdzonym postinstall).
- `docs/` i `AGENTS.md`: „Expo SDK 57 / RN 0.86” → 58 / 0.88.

## 5. iOS natywnie (`ios/`)

Porównanie `ios/` z wynikiem `npx expo prebuild --platform ios` na SDK 58 (w kopii, z waszymi pluginami):

| Element | Teraz | SDK 58 | Co zrobić |
| --- | --- | --- | --- |
| `NiX/SceneDelegate.swift` | brak | `class SceneDelegate: ExpoAppSceneDelegate {}` z `@objc(SceneDelegate)` | dodać plik do targetu NiX |
| `Info.plist` → `UISceneDelegateClassName` | `EXExpoAppSceneDelegate` | `$(PRODUCT_MODULE_NAME).SceneDelegate` | zmienić |
| `AppDelegate.swift` | override `open url` i `continue userActivity` z ręcznym `RCTLinkingManager` | brak tych override'ów; komentarz, że okno tworzy `SceneDelegate` | usunąć oba override'y — wg przewodnika ręczne `RCTLinkingManager` dubluje zdarzenia linków |
| `Info.plist` → `RCTNewArchEnabled` | `true` | brak (stara architektura nie istnieje) | usunąć |
| `Info.plist` → `UIBackgroundModes` | `processing` | **`fetch` + `processing`** | **nie przenosić `fetch`** (usunięty dla App Review w buildzie 15) |
| `Info.plist` → `NSBonjourServices`, `NSLocalNetworkUsageDescription` | brak | dodane przez `expo-dev-client` | nie przenosić (`check:ios-config` i tak ich zabrania) |
| `ExpoWidgetsTarget/Info.plist` | `CFBundleShortVersionString`, `CFBundleVersion`, App Group | bez tych kluczy | zostawić wasze (rozszerzenie musi mieć wersję zgodną z aplikacją) |
| `ExpoWidgetsTarget/ExpoWidgetsLayoutRegistry.config.json` | brak | nowy plik | sprawdzić, czy potrzebny do builda widgetu |
| `Podfile.properties.json` | `ios.enableSceneSupport` | brak | usunąć |
| `Podfile` | — | bez zmian | — |

Wniosek: ręczny merge, nie `prebuild --clean`. `npm run check:ios-config` już blokuje `fetch` w `UIBackgroundModes` oraz klucze lokalnej sieci, więc przypadkowy prebuild zostanie wyłapany przed Archive.

Do sprawdzenia na urządzeniu (ryzyko):

- **Quick actions przy zimnym starcie.** Patch `expo-quick-actions` zapamiętuje `initialAction` z eventu przekazanego przez scenę — sprawdzić, czy SDK 58 (forwarding quick actions jest nowy w 58) nie dubluje akcji.
- **Universal links, `nix://` i tapnięcie powiadomienia przy zimnym starcie** (przewodnik: jeśli `Linking.getInitialURL()` zwraca `null`, zaktualizować `expo`).
- **Share Extension → `extensionContext.open` → aplikacja.**
- **Metody `UIApplicationDelegate` cyklu życia** (`applicationDidBecomeActive` itd.) nie są już wołane — sprawdzić moduły lokalne i biblioteki (`nix-background-uploader`, Sentry, Supabase przez `AppState` są OK).
- **iOS 27 SDK = aplikacja „resizable”.** `requireFullScreen` już nie wyłącza zmiany rozmiaru, a blokada orientacji może nie działać, gdy okno jest skalowalne (iPhone Duo). Ekrany kamery, viewera i preview zakładają pełny ekran w pionie — sprawdzić, jak się zachowują w oknie o innych proporcjach.
- **Moduły lokalne:** `nix-media-overlay` używa `UIScreen.main.scale` (5 miejsc, `NixMediaOverlayModule.swift:946-1302`). Działa, ale w świecie scen lepiej brać `traitCollection.displayScale` z widoku. `nix-passkeys` i `nix-camera-torch` już szukają okna przez `connectedScenes` — OK.
- **`expo-glass-effect`:** `isLiquidGlassAvailable()` zwraca `true` w buildach z iOS 27 SDK — sprawdzić gałęzie fallbacku w `src/lib/liquidGlass.ts`.

## 6. Zmiany zachowania bez błędu kompilacji (do testu wizualnego)

### 6.1 `@expo/ui`

- `<Host>` wyrównuje treść do góry zamiast centrować. Dotyczy hostów bez `matchContents`, które dostają wysokość z RN: `native-glass-pill.tsx:239`, `native-preview-send-button.tsx:50`, `native-chrome-icon-button.tsx:64`, `app-bottom-sheet.ios.tsx:80`, `native-search-field.tsx:77`, `app-host.tsx:44`, `ViewerReplyField.tsx:131`, `NativeLensSwitcher.tsx:219`, `PreviewTextSizeSlider.tsx:55`.
- `HStack`/`VStack`/`GlassEffectContainer` bez `spacing` dostają systemowy odstęp (wcześniej 0). 16 z 88 stosów nie ma `spacing`: `accent-appearance-preview.tsx:39,55,62`, `native-settings.tsx:119,226`, `friend-detail-friendship.tsx:13`, `EditProfileScreenSurface.tsx:368`, `InboxScreenSurface.tsx:705,741,983,1008,1016,1366`, `new-chat.tsx:106`, `forward-message.tsx:115`, `src/widgets/InboxWidget.tsx:87`. Żeby zachować obecny wygląd, dodać `spacing={0}`; tam, gdzie systemowy odstęp wygląda lepiej, zostawić.

### 6.2 Powiadomienia

`expo-notifications` pokazuje teraz powiadomienia w foreground domyślnie, a handler, który nie odpowie w 3 s, już ich nie gubi. NiX ma jawny `setNotificationHandler` (`src/context/PushNotificationsProvider.tsx:51`) z wyciszaniem aktywnego czatu, więc zachowanie się nie zmieni. Do sprawdzenia: powiadomienie w trakcie otwartej rozmowy z tą samą osobą nadal jest wyciszone.

### 6.3 Expo Router — nowy rdzeń nawigacji

- `navigation.dispatch` i akcje są odraczane do po commicie; klucze tras są deterministyczne.
- Moduł `router` (import `{ router }`, w 42 plikach) rzuca, jeśli zostanie użyty przed pierwszym renderem routera. Najbardziej narażony jest bootstrap w `_layout.tsx` (redirecty po sesji) i obsługa linków/powiadomień przy zimnym starcie. Przewodnik zaleca `useRouter()` w komponentach.
- `useNavigation()` musi być wewnątrz nawigatora (`inbox/index.tsx:20` jest w trasie — OK).
- `expo-router/unstable-native-tabs` dalej istnieje, ale NativeTabs są już stabilne pod `expo-router/native-tabs` — przenieść import w `src/components/navigation/app-tabs-layout.tsx:1`.
- Nagłówki `Stack` na iOS 26+ są domyślnie przezroczyste (Liquid Glass) i używają fontu systemowego, jeśli nie ustawicie `fontFamily` — w `_layout.tsx` `fontFamily` jest ustawiony, ale ekrany z `headerShown: true` trzeba przejrzeć.
- Nie używacie: `freezeOnBlur`, `navigationKey`, `beforeRemove`, `usePreventRemove`, `initialParams`, `withLayoutContext`, `expo-router/react-navigation`.

### 6.4 Gesture Handler 3

API builderów (`Gesture.Pan/Tap/Pinch/Rotation/LongPress`, 18 użyć w 12 plikach) dalej działa — nowy `GestureDetector` rozpoznaje stare obiekty i przekazuje je do starej implementacji. Wszystkie te metody są oznaczone `@deprecated` na rzecz hooków (`usePanGesture` itd.), więc migracja może poczekać, ale nie w nieskończoność. `ScrollView` z RNGH (`NotificationPresentation.tsx:4`) jest teraz komponentem v3 — sprawdzić przewijanie i gest zamykania banera. Do smoke testu: viewer (swipe down), swipe-to-reply, naklejki (pinch + rotation), zoom i przełączanie soczewek w kamerze, filtry w preview.

### 6.5 Pozostałe (sprawdzone, bez wpływu lub z niskim wpływem)

- `expo-media-library` (`getUri()` zwraca bieżącą wersję wideo z Photos): NiX używa tylko `Asset.create` — bez wpływu.
- `expo-localization` (RTL): tylko pl/en — bez wpływu.
- `expo-sqlite` (libSQL usunięte): nie używacie.
- `NODE_ENV` ustawiany przez Expo CLI: `expo export` → `.env.production` jak dotąd; vitest nie idzie przez Expo CLI. Niski wpływ.
- `@expo/fingerprint` (preset `balanced`): `runtimeVersion` jest statyczny — bez wpływu.
- `expo login` domyślnie przez przeglądarkę, `--tunnel` wymaga logowania — zmiana w workflow, nie w kodzie.

## 7. Patche `patch-package`

Metoda: tarballe wersji 57 z cache npm porównane z `node_modules` po upgrade oraz próbne nałożenie każdego patcha (dry-run, bez fuzz) na kopiach plików (kod + wykonanie).

`patch-package` nakłada patch na pakiet w całości albo wcale. Po nieudanym `npm install` **żadna** zmiana z pięciu niepasujących patchy nie jest w `node_modules`, także w plikach, których hunki same by weszły (np. `expo-camera/ios/Common/ExpoCameraUtils.swift:23-25` znowu zwraca `.portraitUpsideDown`).

**Bloker builda:** `modules/nix-background-uploader/ios/BackgroundUploadCoordinator.swift:672,1293,1299` i `NixBackgroundUploaderModule.swift:37,147` wołają `ExpoWidgetsLiveActivityBridge`, który istnieje tylko w patchu `expo-widgets`. Bez odtworzenia patcha moduł uploadu się nie skompiluje.

| Patch | Co naprawia | Status w SDK 58 | Nakład |
| --- | --- | --- | --- |
| `expo-constants+57.0.21` | cudzysłowy dla ścieżki projektu ze spacją | **zbędny** — naprawione upstream (PR #48747; `ios/EXConstants.podspec:37-43`, `scripts/get-app-config-ios.sh:22`). Usunąć | — |
| `react-native-screens+4.26.2` | NOTIF-6: `FullWindowOverlay` we własnym `UIWindow` nad arkuszami | nałożył się poprawnie — upstreamowy `RNSFullWindowOverlay.mm` jest identyczny w 4.26.2 i 4.30.0. Przegenerować jako `+4.30.0` | mały |
| `react-native+0.86.3` | cudzysłowy przy ścieżkach ze spacją w `find` (`helpers.rb`, `new_architecture.rb`); zapasowe `s.source` gdy `resolve_podspec_source()` zwraca nil | **do odtworzenia** — 4 hunki wchodzą (upstream nie naprawił). Nie wchodzi tylko `react-native-xcode.sh:171`, który dla NiX jest martwy (bundluje `expo export:embed`) — pominąć. Pliki `rncore.rb.orig` i `rndependencies.rb.orig` w patchu to przypadkowe kopie zapasowe — usunąć | mały |
| `expo-widgets+57.0.23` | (1) publiczny `ExpoWidgetsLiveActivityBridge` dla natywnego uploadu w tle (SEND-2/PERF-8), tylko aktywności `.active`/`.stale`; (2) plugin: `-Onone` tylko w Debug (PERF-28) | **do odtworzenia, bloker**. Hunk Swift w `ios/LiveActivity.swift` wchodzi 1:1, API (`ContentState(name:props:)`, `props` teraz `String?`) jest zgodne. Nowości 58 (`staleDate`, stabilne `activity.id`) są tylko w JS — `LiveActivity`/`LiveActivityFactory` są `internal`, więc mostka nie zastąpią; filtr active/stale jest teraz upstream w `LiveActivityFactory.getInstances()` (`:44`), co ujednolica zachowanie. Hunk w `plugin/build/…/addXCConfigurationList.js` trzeba przepisać ręcznie (nowy format builda) | mały |
| `expo-image-manipulator+57.0.21` | kolejność w `Either`: najpierw `SharedRef<UIImage>`, potem `URL` (trap przy konwersji HostObject → URL) | **do odtworzenia**. W 58 dalej `Either<URL, SharedRef<UIImage>>` i doszedł parametr `options: ImageLoadOptions?` (`ios/ImageManipulatorModule.swift:13-23`). Z kodu nie da się ustalić, czy trap jeszcze występuje; zamiana kolejności jest bezpieczna | mały |
| `expo-camera+57.0.6` | orientacja zdjęcia „do góry nogami”, JPEG zamiast HEVC (czarne zdjęcia z przedniego aparatu), pominięcie cropu przy podglądzie 0×0, wyłączone responsive/fast capture (TrueDepth), wyjście wideo od startu, płynne włączanie latarki przy wideo, przygotowanie lampy, logi DEBUG | **do odtworzenia, ręczne scalanie**. Wchodzą: `ExpoCameraUtils.swift`, `CameraSessionManager.swift`, `CameraView.swift`, hunki 1-2 `CameraPhotoCapture.swift`. Nie wchodzi hunk 3 `CameraPhotoCapture.swift` (upstream przeniósł przetwarzanie do `CapturedPhotoProcessor`, warunek trzeba wstawić w `:197-204`) oraz 5 z 8 hunków `CameraVideoRecording.swift` (`record` rzuca `CameraAlreadyRecordingException`, zniknęło `isValidVideoOptions`, upstream ma własne `fileOutput(_:didStartRecordingTo:from:)` w `:120` — metodę z patcha trzeba z nim połączyć) | średni |
| `expo-quick-actions+6.0.2` | `initialAction` przy zimnym starcie przez scenę | **nadal potrzebny i poprawny** — `ExpoAppSceneDelegate` przekazuje `shortcutItem` przez `SceneEventForwarder` do subskrybentów, a odtworzone `launchOptions` nie zawierają shortcutu | — |
| `react-native-compressor+1.19.4` | `audioBitrate` (PERF-23), Dolby Vision na Androidzie | ta sama wersja, nakłada się | — |
| `query-string+7.1.3` | zgodność z `decode-uri-component@0.5.0` (F16) | ta sama wersja, nadal potrzebny | — |

Uwagi przy odtwarzaniu:

- Poprawka orientacji w `expo-camera` jest nadal potrzebna: nowe `captureOrientation` (`ExpoCameraUtils.swift:83-91`) przy `responsiveOrientationWhenOrientationLocked` (ustawiane w `CameraCaptureSurface.tsx:240`) bierze orientację z akcelerometru.
- W `setCameraMode` patch woła `startRunning()` bez sprawdzenia `hasAvailableCameraDevice`, a upstreamowy fix #49028 celowo nie startuje sesji bez urządzenia — zachować sprawdzenie upstream.
- Przy przegenerowaniu warto oddzielić logi diagnostyczne `[ExpoCameraTorch]` od zmian funkcjonalnych.
- `expo-camera` i `expo-image-manipulator` mają w 58 katalog `prebuilds/` — wpisy w `expo.autolinking.ios.buildFromSource` muszą zostać, inaczej patche nie trafią do builda.
- `expo-widgets` 58 nie nadpisuje już ustawień targetu, jeśli ten istnieje (wczesny `return`), więc hunk `-Onone` ma znaczenie tylko przy `prebuild --clean`; projekt Xcode ma dziś `-O` dla Release.
- `expo-quick-actions`: jeśli zimny start był bez shortcutu, pierwszy shortcut na ciepło też zostaje zapisany jako `initialAction` i po `reloadAsync` (OTA) nawigacja może się powtórzyć. Do rozważenia: zapisywać tylko przed pierwszym `OnStartObserving`. Ten sam problem jest już na SDK 57.

Do zrobienia: usunąć `expo-constants`; przegenerować `react-native-screens` (4.30.0, bez zmian treści), `react-native` (0.88.0, bez `.orig` i bez hunka `react-native-xcode.sh`), `expo-widgets` (58.0.20), `expo-image-manipulator` (58.0.14), `expo-camera` (58.0.10, ręczne scalanie); bez zmian: `expo-quick-actions`, `react-native-compressor`, `query-string`.

## 8. Co warto wykorzystać w NiX

Kolejność według wartości dla NiX, nie według changelogu.

| Funkcja | Po co w NiX | Kiedy |
| --- | --- | --- |
| `expo-camera`: stabilne `deviceType` soczewek | przełącznik soczewek przestaje zależeć od języka urządzenia (dziś PL/EN mogą dawać różne nazwy) | razem z migracją (i tak trzeba) |
| `expo-notifications`: `threadIdentifier` | grupowanie powiadomień per rozmowa w Centrum powiadomień | 1.1.x |
| `expo-notifications`: forwarding delegata iOS | łatwiejsza współpraca z własnym kodem powiadomień (communication notifications) | do oceny przy migracji |
| `expo-widgets`: `staleDate`, stabilne identyfikatory Live Activity | może zastąpić część patcha `expo-widgets` (filtrowanie aktywności) i pozwolić oznaczyć zawieszony upload jako „stale” | razem z migracją patcha |
| `expo-updates`: `updates.maxUpdatesToKeep` | przy kilkudziesięciu OTA na runtime ogranicza miejsce zajmowane na urządzeniu | 1.1.0 (zmiana native) |
| `expo-image`: `transition.skipOnCacheHit` | brak „mrugnięcia” przy obrazach z cache w viewerze (`ViewerScreenSurface.tsx:177`) i siatce Wspomnień (`MemoryGridCell.tsx:72`) | 1.1.x, JS |
| `expo-file-system`: `File.digest()` | skrót pliku natywnie zamiast wczytywania bajtów do JS (np. kontrola integralności mediów przed uploadem) | opcjonalnie |
| `expo-audio`: nagrywanie WAV/PCM, `AudioStream` | jeśli wiadomości głosowe mają mieć wizualizację fali lub transkrypcję | opcjonalnie |
| `@expo/ui`: listy z recyklingiem (`List`/`LazyVStack` z `data`) | natywne listy w ustawieniach i listach znajomych | opcjonalnie; FlashList zostaje dla czatu |
| `@expo/ui`: `NavigationStack`, `Toolbar` | — | nie teraz (macie Expo Router) |
| `expo-app-intents` (alpha) | „Wyślij NiX do…” w Siri/Skrótach | po wyjściu z alpha |
| Expo Modules 2.0 (beta) | szybsze wywołania w 5 modułach lokalnych | po wyjściu z beta |
| `@expo/agent-cli` | `status`, `smoke`, `expo-doctor` dla agentów | opcjonalnie, dev |

Bez znaczenia dla NiX (tylko iOS, bez webu): prebuilt `expo-modules-core` i R8 na Androidzie, `expo-hinge`, `server` jako domyślny output webu, SSR i loadery.

## 9. Plan pracy na gałęzi

Strategia gałęzi w trakcie App Review:

- `main` = 1.0.13 / runtime `1.0.13` / SDK 57. Hotfixy OTA (Ścieżka A) tylko stąd.
- `upgrade/expo-sdk-58` = migracja. Regularnie `git merge main` (bez rebase, żeby nie przepisywać historii).
- Buildy z gałęzi tylko lokalnie (Ścieżka B), do TestFlight dopiero z nowym `runtimeVersion`. Żadnego `eas update --channel production` z tej gałęzi.
- Merge do `main` dopiero po decyzji App Review dla 1.0.13 i po smoke teście.

Kroki:

1. Zależności: wersje z sekcji 3, `npm install` (lockfile do regeneracji — konflikt peer), `tsconfig.json` → `expo/tsconfig.base.json`. Zweryfikować: `npm run expo-install-check`, `npm run audit:reviewed`.
2. Patche: odtworzyć lub usunąć według sekcji 7. Zweryfikować: `npm install` bez błędów `patch-package`.
3. Kod: sekcja 4 (najpierw 4.1 i 4.2, potem typy). Zweryfikować: `npm run typecheck && npm run lint && npm test`.
4. iOS: sekcja 5, ręcznie. Usunąć `enableSceneSupport`. `pod install`. Build Debug na urządzeniu.
5. Wizualnie: sekcja 6.1 (light + dark), nawigacja 6.3, gesty 6.4.
6. Wydanie: `runtimeVersion` + wersja, `npm run check:ios-config`, `npm run check:release-env`, Archive Release, TestFlight Internal QA.

Odtworzenie próby z tego raportu:

```bash
git checkout -b upgrade/expo-sdk-58 main
# package.json: wersje z bundledNativeModules.json expo@58.0.13, @types/react ~19.3.0
rm -rf node_modules package-lock.json && npm install
sed -i 's#"expo/tsconfig.base"#"expo/tsconfig.base.json"#' tsconfig.json
npm run typecheck; npx vitest run; npm run lint; npx expo-doctor@latest
```

Smoke test na urządzeniu (iOS 27, light + dark):

- [ ] zimny start: zalogowany, wylogowany, w trakcie onboardingu
- [ ] logowanie e-mail i Apple, passkey, wylogowanie, usunięcie konta
- [ ] link `nix://`, universal link zaproszenia (zimny i ciepły start), skan QR
- [ ] tapnięcie powiadomienia (zimny i ciepły start); powiadomienie w foreground przy otwartym i innym czacie
- [ ] quick actions z ikony (zimny i ciepły start) — bez podwójnej akcji
- [ ] kamera: przełączanie soczewek (urządzenie PL i EN), zoom, latarka, nagrywanie wideo z pierścieniem postępu
- [ ] preview: tekst, naklejki (pinch/rotation), filtry, wysyłka; upload w tle i Live Activity; widget
- [ ] viewer: swipe down, replay, odpowiedź
- [ ] czat: swipe-to-reply, menu wiadomości, wiadomość głosowa
- [ ] Wspomnienia: zapis, ponowne uruchomienie aplikacji, indeks dalej się odczytuje (4.1)
- [ ] welcome tour (4.2)
- [ ] Share Extension → NiX
- [ ] ekrany z sekcji 6.1 — porównanie zrzutów z SDK 57
