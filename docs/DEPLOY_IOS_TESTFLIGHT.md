# NiX — Deploy iOS (cost-first)

> **Źródło prawdy** dla wydawania NiX na iOS (ludzie i agenci AI).  
> Nazwa pliku historyczna — treść obejmuje **oba** tryby: OTA JS oraz lokalny binary TestFlight.

## 0. Reguły dla agentów (MUST)

1. **Nie uruchamiaj** `eas build` ani `eas submit`, chyba że użytkownik **jawnie** o to poprosi. Domyślna ścieżka binary to lokalny **Xcode Archive** (ten dokument, Ścieżka B).
2. **Hotfix tylko JS / assets** (bez native, bez bumpa `runtimeVersion`) → **Ścieżka A**: `eas update --channel production`.
3. **Zmiany native** (SDK, plugins, entitlements, uprawnienia, nowa natywna zależność, bump `runtimeVersion`) → **Ścieżka B**: Xcode → TestFlight.
4. Przy niepewności „czy to native?” → **Ścieżka B** (bezpieczniejsze niż OTA na zły runtime).
5. Przed OTA sprawdź: `runtimeVersion` w `app.json` / `Expo.plist` oraz kanał `production` w `updates.requestHeaders` i `EXUpdatesRequestHeaders`.
6. Self-host OTA „żeby uniknąć EAS” **nie** rozwiązuje limitu buildów — nie proponuj tego jako oszczędności `eas build`.

Reguła Cursor: [`.cursor/rules/deploy-cost-first.mdc`](../.cursor/rules/deploy-cost-first.mdc).

## 1. Cel i architektura kosztowa

| Cel | Narzędzie | Zużywa limit EAS Build? |
| --- | --- | --- |
| Codzienny development | lokalnie (`npx expo run:ios` / symulator) | Nie |
| Hotfix JS / assets na istniejący binary | `eas update --channel production` | **Nie** (osobny limit Update / MAU) |
| Nowy binary / native / nowy `runtimeVersion` | Xcode Archive → App Store Connect → TestFlight | **Nie** |
| `eas build` / `eas submit` | tylko wyjątek na prośbę usera | **Tak** (~15 iOS / mies. na Free) |

```text
Zmiana w kodzie
        │
        ▼
 Czy wymaga native / nowego runtimeVersion / nowych uprawnień?
        │
   nie  │  tak
        ▼        ▼
  eas update   Xcode Archive → TestFlight
  (kanał       (Ścieżka B)
   production)
        │
        └── W obu przypadkach: NIE używaj eas build / eas submit
```

Ścieżka historyczna „wydanie wyłącznie przez EAS Build” pozostaje w [`internal-testflight-release-runbook.md`](./internal-testflight-release-runbook.md) jako **legacy / wyjątek**, nie jako default.

## 2. Macierz decyzji

| Rodzaj zmiany | Ścieżka |
| --- | --- |
| Logika JS/TS, UI React, style, copy, assety w bundlu | **A — OTA** |
| `src/**`, bez zmian w `ios/`, `android/`, `app.json` plugins | **A — OTA** |
| Nowa / zaktualizowana natywna biblioteka, Expo SDK, config plugin | **B — Xcode** |
| Zmiana `ios/`, entitlements, Info.plist purpose strings, capabilities | **B — Xcode** |
| Zmiana `runtimeVersion` / `EXUpdatesRuntimeVersion` | **B — Xcode** (OTA nie dotrze do starych binarek) |
| Ikony / splash wymagające sync `prebuild` do `ios/` | **B — Xcode** (po review diffu `ios/`) |
| Niepewność | **B — Xcode** |

## 3. Koszty EAS (dlaczego cost-first)

| Usługa | Plan Free (orientacyjnie) | Uwaga |
| --- | --- | --- |
| **EAS Build** | ~15 iOS + ~15 Android / miesiąc | **To pali limit** — unikaj |
| **EAS Update** | ~1k MAU | Osobny limit; OTA **nie** zużywa build credits |
| **EAS Submit** | powiązane z chmurowym buildem | Nie używamy — upload z Xcode |

Własny serwer OTA (Expo Updates Protocol) wymaga utrzymania infrastruktury i **nowego** binary z innym `updates.url` — nie oszczędza limitów Build.

Aktualne limity weryfikuj na [expo.dev/pricing](https://expo.dev/pricing).

---

## 4. Ścieżka A — OTA (`eas update`)

Dla hotfixów JS/assets na binarki już zainstalowane przez TestFlight, które mają:

- ten sam `runtimeVersion` (obecnie **`1.0.4`**),
- kanał **`production`** (`expo-channel-name`),
- `EXUpdatesURL` → `https://u.expo.dev/<projectId>`.

### 4.1 Wymaganie: binary z kanałem `production`

W repozytorium kanał jest ustawiony w:

- `app.json` → `expo.updates.requestHeaders["expo-channel-name"]` = `production`
- `ios/NiX/Supporting/Expo.plist` → `EXUpdatesRequestHeaders` → `expo-channel-name` = `production`

**Buildy TestFlight zbudowane przed tą konfiguracją nie mają kanału w binarnym `Expo.plist`.** Pierwsze skuteczne OTA na `production` wymaga **co najmniej jednego** lokalnego Archive (Ścieżka B) po tej zmianie, potem kolejne hotfixy mogą iść OTA.

### 4.2 Kroki publikacji OTA

```bash
# 1. Gates (minimum)
git status
npm run typecheck
npm run lint
npm test

# 2. Zaloguj EAS (raz na maszynę)
eas whoami || eas login

# 3. Publikuj update na kanał production
eas update --channel production --message "krótki opis zmiany"

# SDK 55+: jeśli CLI wymaga środowiska EAS:
# eas update --channel production --message "…" --environment production
```

### 4.3 Weryfikacja na urządzeniu

1. Aplikacja TestFlight z binary o `runtimeVersion` `1.0.4` i kanale `production`.
2. Force quit → otwórz (pobranie update w tle) → force quit → otwórz ponownie (zastosowanie).
3. Potwierdź, że zmiana JS jest widoczna.
4. W razie braku update: sprawdź kanał, `runtimeVersion`, sieć, dashboard EAS Update dla projektu.

### 4.4 Checklista OTA (kopiuj)

```text
[ ] Zmiana jest JS/assets only (brak native / plugins / runtimeVersion)
[ ] runtimeVersion w app.json i Expo.plist = ten sam co na TF (obecnie 1.0.4)
[ ] Binary na TF ma expo-channel-name=production (po Archive z tą konfiguracją)
[ ] npm run typecheck && npm run lint && npm test
[ ] eas update --channel production --message "…"
[ ] Smoke: force quit ×2 na urządzeniu TestFlight
```

---

## 5. `runtimeVersion`

| Plik | Klucz | Wartość (obecnie) |
| --- | --- | --- |
| `app.json` | `expo.runtimeVersion` | `1.0.4` |
| `ios/NiX/Supporting/Expo.plist` | `EXUpdatesRuntimeVersion` | `1.0.4` |

**Bumpuj** `runtimeVersion` (i zsynchronizuj oba pliki), gdy:

- upgrade Expo SDK / React Native,
- dodanie lub major native module,
- zmiana wymagająca nowego native binary, której stary JS bundle nie obsłuży.

Po bumpie: **tylko Ścieżka B**. Stare binarki nie pobiorą OTA z nowym runtime; nowe OTA publikuj dopiero po TF z nowym runtime.

Wersja marketingowa (`expo.version` / `CFBundleShortVersionString`) i numer buildu (`CFBundleVersion`) to osobne pojęcia — patrz [sekcja 14](#14-wersjonowanie).

---

## 6. Anti-patterns

| Nie rób | Zamiast tego |
| --- | --- |
| `eas build` „na szybko” przy każdej zmianie | OTA (A) lub lokalny Xcode (B) |
| `eas submit` zamiast Organizer → Upload | Ścieżka B, sekcja 17 |
| OTA po zmianie native / SDK bez nowego binary | Ścieżka B + ewentualny bump `runtimeVersion` |
| `eas update` na kanał inny niż w binary | Zawsze `--channel production` (zgodny z `Expo.plist`) |
| Self-host OTA „żeby nie płacić za EAS” przy limicie Build | Unikaj `eas build`; Update na Free wystarcza przy Internal TF |
| `expo prebuild --clean` bez review | Bare workflow — review diffu `ios/` |

---

# Ścieżka B — Binary: lokalny Xcode → TestFlight

Poniższe sekcje opisują **powtarzalny proces binary** bez EAS Build / EAS Submit.

Proces opiera się na:

- lokalnym buildzie na macOS,
- natywnym projekcie iOS w repozytorium (`ios/`),
- Xcode,
- Apple Developer Program,
- App Store Connect,
- TestFlight.

**W Ścieżce B nie używaj:** `eas build`, `eas submit`, chmurowych buildów Expo.  
(`eas update` należy do Ścieżki A — nie mieszaj z Archive.)

## 7. Architektura procesu binary

```text
Kod aplikacji
→ konfiguracja Expo (app.json)
→ natywny projekt iOS (ios/, commitowany)
→ instalacja CocoaPods
→ build Release (Xcode / xcodebuild)
→ Archive
→ podpisanie aplikacji (Apple Distribution)
→ App Store Connect
→ TestFlight
```

Projekt jest w **bare workflow**: katalog `ios/` jest w Git. Zmiany w `app.json` (plugins, Info.plist, ikony, splash) wymagają kontrolowanego `npx expo prebuild --platform ios --no-install` oraz ręcznego przeglądu diffu — nie synchronizują się same przy Archive.

## 8. Wymagania

| Wymaganie | Wartość / uwagi |
| --- | --- |
| Komputer | Mac z macOS obsługującym zainstalowany Xcode |
| Xcode | **26 lub nowszy** (od 28.04.2026 App Store Connect wymaga buildów z Xcode 26 / iOS 26 SDK) — sprawdź: `xcodebuild -version` |
| Apple Developer Program | Aktywne członkostwo + dostęp do właściwego zespołu |
| App Store Connect | Dostęp do aplikacji NiX |
| Node.js | **20+** (zalecane w README) |
| Package manager | **npm** (`package-lock.json`) — nie mieszaj z yarn/pnpm/bun |
| CocoaPods | Instalowane przez `npx pod-install ios` |
| Natywny projekt | `ios/NiX.xcworkspace`, schemat **NiX** |
| Bundle Identifier | `com.damianmotylinski.nixapp` (musi zgadzać się z App ID i ASC) |
| Aplikacja w ASC | Już utworzona; numeryczny App ID referencyjnie w `eas.json` → `submit.production.ios.ascAppId` (proces lokalny nie wywołuje EAS) |
| OTA (po Archive) | `Expo.plist`: `EXUpdatesURL`, `EXUpdatesRuntimeVersion`, `expo-channel-name=production` |

Przed pierwszym Archive upewnij się, że w App Store Connect istnieje rekord aplikacji ze zgodnym Bundle ID.

## 9. Pierwsza konfiguracja projektu iOS

### Scenariusz A: katalog `ios` już istnieje (stan NiX)

Katalog `ios/` **jest w repozytorium**. Nie generuj go od zera.

1. Zainstaluj zależności JS: `npm ci`
2. Zainstaluj pody: `npx pod-install ios`
3. Otwórz **`ios/NiX.xcworkspace`** (nie `.xcodeproj`)
4. Target: **NiX**
5. Schemat: **NiX** (Archive Action = konfiguracja **Release**)
6. Bundle Identifier: `com.damianmotylinski.nixapp`
7. Signing: Team `9Q39P5MUT9`, **Automatically manage signing**
8. Konfiguracja Release w schemacie (Profile / Archive)
9. Capabilities: Push Notifications (`aps-environment`), Sign in with Apple — bez Background Modes / Face ID „na zapas”
10. Wersja marketingowa i build: patrz [sekcja 14](#14-wersjonowanie); zweryfikuj `npm run check:ios-config`
11. OTA: potwierdź `EXUpdatesRequestHeaders` → `production` w `Expo.plist`

### Scenariusz B: katalog `ios` nie istnieje

W bieżącym repozytorium ten scenariusz **nie dotyczy** produkcji (folder jest commitowany). Gdyby kiedyś brakowało `ios/`:

1. Zapisz stan Git; working tree musi być czysty
2. Sprawdź config plugins w `app.json`
3. `npx expo prebuild --platform ios` (**bez** `--clean`, o ile nie jest absolutnie konieczne)
4. Przejrzyj `git status` / `git diff` — szczególnie entitlements, Info.plist, signing, `Expo.plist`
5. Dopiero potem `npx pod-install ios` i otwarcie workspace

**Nigdy** nie uruchamiaj `expo prebuild --clean` bez analizy tego, co zostanie nadpisane (ręczne poprawki natywne, plugin `./plugins/withIosXcodeSpacesInPathFix.js`, lokalizacje purpose strings, kanał OTA).

## 10. Instalacja zależności

```bash
npm ci
npx pod-install ios
npm run check:ios-config
npm run check:sentry-disabled
open ios/NiX.xcworkspace
```

Po `pod-install` **zawsze** uruchom `check:ios-config` i `check:sentry-disabled`. CocoaPods / Expo mogą przepisać UUIDy w `project.pbxproj` oraz zregenerować fazę „Upload Debug Symbols to Sentry” **bez** `SENTRY_DISABLE_*` — w takim przypadku przywróć eksporty w fazie Xcode (jak w HEAD / checku) albo dodaj je ponownie:

```text
export SENTRY_DISABLE_AUTO_UPLOAD=true
export SENTRY_DISABLE_XCODE_DEBUG_UPLOAD=true
```

Dlaczego `.xcworkspace`, a nie `.xcodeproj`: projekt używa CocoaPods (`ios/Podfile`). Workspace łączy target aplikacji z targetami Pods. Otwarcie samego `.xcodeproj` kończy się błędami linkowania / brakującymi modułami.

`ios/Pods/` i `ios/build/` są w `.gitignore` — zawsze instaluj pody lokalnie przed buildem.

## 11. Konfiguracja zmiennych środowiskowych

### Publiczne (trafią do bundla JS w Release)

| Zmienna | Rola |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | URL projektu Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Klucz anon (publiczny, chroniony przez RLS) |

Ładowane z lokalnego `.env` (plik w `.gitignore`). Expo wczytuje je przy bundlowaniu; faza Xcode „Bundle React Native code and images” musi widzieć te wartości.

### Sekrety — nigdy w aplikacji mobilnej ani w docs

- `SUPABASE_SERVICE_ROLE_KEY`
- `MODERATOR_API_SECRET` / `MODERATION_CLEANUP_SECRET`
- `EXPO_ACCESS_TOKEN`
- pliki `.p8`, hasła aplikacyjne Apple, tokeny logowania
- produkcyjne DSN Sentry (Sentry jest twardo wyłączone: `SENTRY_RUNTIME_ENABLED = false`)

### Lokalne przy budowaniu (nie sekret produktu)

W wersjonowanym [`ios/.xcode.env`](../ios/.xcode.env):

- `NODE_BINARY`
- `SENTRY_DISABLE_AUTO_UPLOAD=true`
- `SENTRY_DISABLE_XCODE_DEBUG_UPLOAD=true`

Opcjonalne `ios/.xcode.env.local` (gitignored) na lokalne nadpisania Node.

### Weryfikacja, że Archive nie bierze konfiguracji developerskiej

1. Potwierdź, że `.env` wskazuje na **produkcyjny** projekt Supabase (URL bez lokalnego stacka).
2. Uruchom `npm run check:sentry-disabled`.
3. Po zbudowaniu Release sprawdź w aplikacji logowanie względem produkcji (nie lokalnego Supabase).
4. Nie polegaj na Metro w Release — JS jest wbudowany w binarkę (późniejsze hotfixy JS: Ścieżka A).

Nie wpisuj rzeczywistych wartości sekretów do repozytorium ani do tej instrukcji.

## 12. Bundle Identifier i App Store Connect

Wszystkie poniższe muszą być identyczne:

| Miejsce | Oczekiwana wartość |
| --- | --- |
| `app.json` → `expo.ios.bundleIdentifier` | `com.damianmotylinski.nixapp` |
| Xcode → target NiX → Signing & Capabilities / Build Settings | `com.damianmotylinski.nixapp` |
| Apple Developer → Identifiers (App ID) | `com.damianmotylinski.nixapp` |
| App Store Connect → App Information | ten sam Bundle ID |

Nie twórz nowego identyfikatora, jeśli istniejący jest poprawny. Walidacja lokalna: `npm run check:ios-config` (porównuje `PRODUCT_BUNDLE_IDENTIFIER` z `app.json`).

## 13. Signing & Capabilities

1. Otwórz `ios/NiX.xcworkspace`
2. Wybierz target **NiX**
3. Zakładka **Signing & Capabilities**
4. Zaznacz **Automatically manage signing**
5. Team: **`9Q39P5MUT9`** (ten sam co w `project.pbxproj`)
6. Bundle Identifier: `com.damianmotylinski.nixapp`

### Automatic vs ręczne

Dla lokalnego Archive → App Store Connect **automatic signing** jest właściwym domyślnym trybem w tym projekcie (`CODE_SIGN_STYLE = Automatic`). Xcode dobierze certyfikat **Apple Distribution** i profil App Store przy dystrybucji.

| Certyfikat | Zastosowanie |
| --- | --- |
| Apple Development | Debug / uruchomienie na urządzeniu |
| Apple Distribution | Archive → TestFlight / App Store |

### Wymagane capabilities NiX (tylko faktyczne)

- **Push Notifications** — entitlement `aps-environment` w `ios/NiX/NiX.entitlements`
- **Sign in with Apple** — `com.apple.developer.applesignin`

**Nie dodawaj** Background Modes, Associated Domains, Keychain Sharing, Face ID „na zapas” — `check:ios-config` świadomie zabrania m.in. `UIBackgroundModes` i `NSFaceIDUsageDescription`.

### `aps-environment`

W repozytorium może być `development` (lokalne buildy). Przy uploadzie do App Store Connect profil dystrybucyjny powinien ustawić **production** w podpisanych entitlements IPA. Po Archive zweryfikuj entitlements IPA (patrz troubleshooting push).

### Typowe błędy provisioning

- Zły Team → czerwony komunikat w Signing
- Brak profilu → Xcode nie może utworzyć / pobrać profilu (sprawdź rolę w zespole i App ID)
- `No signing certificate` → brak Distribution w Keychain / Xcode Accounts

## 14. Wersjonowanie

| Pojęcie | Przykład | Gdzie w NiX |
| --- | --- | --- |
| Wersja marketingowa | `1.0.3` | **Źródło prawdy:** `app.json` → `expo.version`. Musi równać się: `package.json` `version`, `ios/NiX/Info.plist` `CFBundleShortVersionString`, `MARKETING_VERSION` w `project.pbxproj` |
| `runtimeVersion` (OTA) | `1.0.4` | `app.json` + `Expo.plist` — bump tylko przy native (sekcja 5) |
| Numer buildu | `1`, `2`, `3`… | **Źródło prawdy:** natywny iOS. Ustaw **jednocześnie**: `Info.plist` → `CFBundleVersion` **oraz** `project.pbxproj` → `CURRENT_PROJECT_VERSION`. Brak `ios.buildNumber` w `app.json`. **Nie** używaj EAS `autoIncrement` w tej ścieżce |

Każdy upload do App Store Connect wymaga numeru buildu **wyższego** niż poprzedni build dla danej wersji marketingowej (reguła Apple).

### Procedura

```text
1. Sprawdź aktualną wersję w app.json / Info.plist (npm run check:ios-config).
2. Sprawdź ostatni build tej wersji w App Store Connect → TestFlight / Activity.
3. Zwiększ CFBundleVersion i CURRENT_PROJECT_VERSION (ta sama liczba).
4. Zweryfikuj: check:ios-config + podgląd w Xcode (General → Version / Build).
5. Dopiero potem Product → Archive.
```

Nie zwiększaj wersji marketingowej bez potrzeby (np. gdy wysyłasz kolejny kandydat tej samej wersji).

## 15. Uprawnienia i `Info.plist`

NiX używa (i deklaruje) wyłącznie:

| Uprawnienie | Klucz | Opis (EN w plist; PL w `pl.lproj`) |
| --- | --- | --- |
| Kamera | `NSCameraUsageDescription` | zdjęcia i wideo wysyłane do znajomych |
| Mikrofon | `NSMicrophoneUsageDescription` | dźwięk w wideo |
| Biblioteka zdjęć | `NSPhotoLibraryUsageDescription` | avatar / wybór mediów |

Dodatkowo: `ITSAppUsesNonExemptEncryption = false` (export compliance).

**Nie używane / nie dodawać:** lokalizacja, kontakty, Bluetooth, Face ID, Local Network.

Po zmianie tekstów w `app.json` zsynchronizuj natywne pliki (`prebuild --no-install` + review) i uruchom `npm run check:ios-config`.

## 16. Przygotowanie wersji produkcyjnej

Checklist przed buildem (skrypty wyłącznie z `package.json`):

```bash
git status                    # czysty tree, właściwy branch
npm ci
npm run typecheck
npm run lint
npm test
npm run check-knip
npm run expo-doctor
npm run expo-install-check
npm run check:ios-config
npm run check:sentry-disabled
npm run doctor:react:ci
npm run export:production     # Hermes / eksport JS bez uploadu Sentry
```

Ręcznie:

- [ ] poprawne `.env` produkcyjne (`EXPO_PUBLIC_*`)
- [ ] wersja marketingowa i nowy numer buildu (sekcja 14)
- [ ] kanał OTA `production` w `Expo.plist` (sekcja 4.1)
- [ ] ikony / splash (`assets/brand/...`)
- [ ] brak debugowych ekranów i developerskich endpointów
- [ ] logowanie (e-mail + Apple), kamera, zdjęcia, powiadomienia — smoke na urządzeniu
- [ ] Release na fizycznym iPhonie przed Archive (sekcja 17)

## 17. Lokalny test konfiguracji Release

Cel: upewnić się, że Release działa **bez Metro** i z produkcyjnym backendem.

### Opcja A — Xcode

1. `open ios/NiX.xcworkspace`
2. Schemat **NiX**, urządzenie fizyczne
3. Product → Scheme → Edit Scheme → Run → Build Configuration = **Release** (tymczasowo) **albo** Product → Profile
4. Zainstaluj na iPhonie

### Opcja B — CLI

```bash
npx expo run:ios --configuration Release --device
```

(wymaga podłączonego urządzenia / właściwego UDID)

### Co sprawdzić

- [ ] Aplikacja startuje bez podłączonego Metro
- [ ] Połączenie z produkcyjnym Supabase
- [ ] Logowanie / rejestracja / Sign in with Apple
- [ ] Kamera, wybór zdjęć, upload
- [ ] Powiadomienia (wymaga fizycznego urządzenia i właściwego APNs)
- [ ] Deep link `nix://`
- [ ] Restart aplikacji — sesja / stan
- [ ] Brak crashy natywnych

Po teście przywróć schemat Run na **Debug**, jeśli go zmieniałeś.

## 18. Tworzenie archiwum w Xcode

1. Otwórz `ios/NiX.xcworkspace`
2. Schemat: **NiX**
3. Destination: **Any iOS Device (arm64)** (lub aktualny odpowiednik w Twoim Xcode)
4. Potwierdź Archive Action = **Release** (Edit Scheme → Archive)
5. **Product → Archive**
6. Poczekaj na zakończenie
7. Otwórz **Organizer** (Window → Organizer)
8. Sprawdź: wersję, numer buildu, Bundle ID `com.damianmotylinski.nixapp`, podpis

### Archive nieaktywne — typowe przyczyny

- Wybrane jest symulator, a nie „Any iOS Device”
- Otwarty jest `.xcodeproj` zamiast `.xcworkspace`
- Zły schemat / brak targetu NiX w Build Action
- Błędy kompilacji uniemożliwiają Archive
- Brakujący signing / Team

## 19. Wysyłka do App Store Connect

W Xcode Organizer:

1. Wybierz świeże archiwum NiX
2. **Distribute App**
3. **App Store Connect**
4. **Upload**
5. Pozostaw automatic signing, jeśli Team i Bundle ID są poprawne
6. Przejdź walidację Xcode
7. Wyślij
8. W ASC poczekaj na przetworzenie buildu (czas bywa różny — nie zgaduj; odświeżaj Activity / TestFlight)

**Nie deklaruj sukcesu**, dopóki Xcode nie potwierdzi uploadu.

Zapisz lokalnie (np. w rejestrze wydań, sekcja 22):

| Pole | Przykład |
| --- | --- |
| Wersja | `1.0.3` |
| Build | `N` |
| Data | ISO / lokalna |
| Commit | `git rev-parse HEAD` |
| Walidacja | PASS / FAIL |
| Upload | PASS / FAIL |

## 20. Konfiguracja TestFlight

1. [App Store Connect](https://appstoreconnect.apple.com) → Apps → **NiX** → **TestFlight**
2. Poczekaj, aż build opuści stan przetwarzania (Processing → gotowy do testów)
3. Uzupełnij **Export Compliance**, jeśli ASC zapyta — w projekcie `ITSAppUsesNonExemptEncryption = false` (szyfrowanie standardowe / exempt); potwierdź zgodnie z aktualnymi pytaniami Apple
4. Uzupełnij wymagane metadane beta zgodnie z wymaganiami ASC

### Testerzy wewnętrzni vs zewnętrzni

| | Wewnętrzni | Zewnętrzni |
| --- | --- | --- |
| Kto | członkowie zespołu ASC / App Store Connect Users | zaproszeni testerzy spoza zespołu |
| Review | zwykle bez Beta App Review | wymaga **Beta App Review** |
| Grupa w NiX (wewnętrzna) | **NiX Internal QA** (wg istniejącej dokumentacji wewnętrznej) | nie używaj przy pierwszym wewnętrznym smoke |

Kroki wewnętrzne:

1. Utwórz / wybierz grupę (np. **NiX Internal QA**)
2. Wyłącz automatyczną dystrybucję, jeśli chcesz kontrolować moment udostępnienia
3. Dodaj build do grupy
4. Uzupełnij **What to Test** (szablon: [`internal-testflight-what-to-test.md`](./internal-testflight-what-to-test.md))
5. Zaproś testerów

Limity miejsc, czas wygaśnięcia buildów TestFlight i czasy przetwarzania **weryfikuj w oficjalnej dokumentacji Apple** — nie utrwalamy tu liczb, które Apple może zmienić.

## 21. Kolejne wydania binary (runbook)

```text
1. Pobierz aktualny kod (git pull / checkout docelowego brancha).
2. npm ci && npx pod-install ios
3. Walidacja: typecheck, lint, test, check-knip, expo-doctor, expo-install-check,
   check:ios-config, check:sentry-disabled (+ doctor:react:ci wg potrzeby)
4. Ustaw produkcyjne .env (EXPO_PUBLIC_*)
5. Sprawdź ostatni build w ASC; zwiększ CFBundleVersion + CURRENT_PROJECT_VERSION
6. git status / diff — potwierdź zamierzone zmiany
7. Przetestuj Release na fizycznym iPhonie
8. open ios/NiX.xcworkspace
9. Product → Archive (Any iOS Device, schemat NiX)
10. Zweryfikuj archiwum w Organizerze
11. Distribute App → App Store Connect → Upload
12. TestFlight: dodaj build do grupy, What to Test
13. Zapisz wiersz w rejestrze wydań (sekcja 22)
```

Dla kolejnych **hotfixów JS** po tym binary — wróć do [Ścieżki A](#4-ścieżka-a--ota-eas-update).

## 22. Troubleshooting

Dla każdego problemu: **objaw → przyczyna → diagnostyka → bezpieczne rozwiązanie**.

### Brakujący provisioning profile

- **Objaw:** błąd profilu przy Archive / Distribute
- **Przyczyna:** App ID / Team / capabilities nie zgadzają się
- **Diagnostyka:** Signing & Capabilities targetu NiX; Apple Developer → Profiles
- **Rozwiązanie:** Automatic signing + poprawny Team; odśwież profiles w Xcode Accounts. Nie usuwaj cudzych certyfikatów „na ślepo”

### Błędny Team

- **Objaw:** inny team niż `9Q39P5MUT9` / brak uprawnień ASC
- **Przyczyna:** zalogowane konto bez dostępu do właściwego zespołu
- **Diagnostyka:** Xcode → Settings → Accounts; porównaj z `DEVELOPMENT_TEAM` w pbxproj
- **Rozwiązanie:** wybierz Team `9Q39P5MUT9`; nie zmieniaj Team w repo bez decyzji właściciela

### Niezgodny Bundle Identifier

- **Objaw:** upload odrzucony / inna aplikacja w ASC
- **Przyczyna:** drift `app.json` vs Xcode vs ASC
- **Diagnostyka:** `npm run check:ios-config`; porównaj ASC
- **Rozwiązanie:** przywróć `com.damianmotylinski.nixapp` — nie twórz nowego ID

### Wygasły certyfikat / No signing certificate

- **Objaw:** brak Distribution certificate
- **Przyczyna:** wygasły cert lub pusty Keychain
- **Diagnostyka:** Keychain Access / Xcode Accounts → Manage Certificates
- **Rozwiązanie:** utwórz / odnów Distribution przez Xcode (Automatic). Nie unieważniaj działających certyfikatów zespołu bez uzgodnienia

### Błędy CocoaPods

- **Objaw:** brakujące moduły, czerwone Pods
- **Przyczyna:** niezaainstalowane / nieaktualne Pods
- **Diagnostyka:** `cd ios && pod install` / `npx pod-install ios`
- **Rozwiązanie:** `npm ci` → `npx pod-install ios`; otwórz workspace

### Niezgodność wersji Xcode

- **Objaw:** ASC odrzuca binary (SDK za stary)
- **Przyczyna:** Xcode &lt; 26 po 28.04.2026
- **Diagnostyka:** `xcodebuild -version`
- **Rozwiązanie:** zainstaluj Xcode 26+, `xcode-select -s` na właściwą ścieżkę

### PhaseScriptExecution

- **Objaw:** Build failed w Run Script (Bundle RN / Sentry / pods)
- **Przyczyna:** zły `NODE_BINARY`, brak `.env`, ścieżki ze spacjami, Sentry upload
- **Diagnostyka:** log fazy w Report navigator; sprawdź `.xcode.env` / `.xcode.env.local`
- **Rozwiązanie:** ustaw `NODE_BINARY`; trzymaj `SENTRY_DISABLE_*=true`; plugin `withIosXcodeSpacesInPathFix` chroni ścieżki ze spacjami

### Hermes / moduły Expo

- **Objaw:** crash przy starcie Release / błąd hermesc
- **Przyczyna:** uszkodzony bundle, niespójne native modules
- **Diagnostyka:** `npm run export:production`; `npm run expo-doctor`; czysty DerivedData
- **Rozwiązanie:** `npm ci`, `pod-install`, nie mieszaj wersji Expo (użyj `expo-install-check`)

### Brak schematu / Archive nieaktywne

- Patrz sekcja 18. Upewnij się, że otwarty jest **NiX.xcworkspace** i destination to urządzenie generyczne, nie symulator.

### Błąd numeru buildu

- **Objaw:** ASC: build number already used
- **Przyczyna:** ten sam `CFBundleVersion` już wysłany
- **Diagnostyka:** TestFlight → poprzednie buildy dla wersji
- **Rozwiązanie:** zwiększ `CFBundleVersion` + `CURRENT_PROJECT_VERSION`; nie da się nadpisać starego numeru

### Brakujące ikony / purpose strings

- **Objaw:** walidacja archiwum / App Review
- **Diagnostyka:** `Images.xcassets/AppIcon`; `check:ios-config`
- **Rozwiązanie:** uzupełnij assety z `assets/brand/app/`; zsynchronizuj teksty EN/PL

### Walidacja archiwum / build niewidoczny w TestFlight

- Poczekaj na Processing; sprawdź e-mail ASC / zakładkę Activity pod kątem błędów binarnych
- Upewnij się, że upload zakończył się sukcesem w Xcode

### Export compliance

- Odpowiedz zgodnie z `ITSAppUsesNonExemptEncryption = false` i aktualnymi pytaniami ASC

### Push notifications

- Dev działa, TF nie: sprawdź `aps-environment=production` w entitlements IPA; klucz APNs w Developer Account; token urządzenia w backendzie

### Działa w development, nie w Release

- Metro podaje inny JS / inne env; Release bundluje `.env` z chwili buildu
- Sprawdź `__DEV__` ścieżki, brakujące native flags, ATS, produkcyjny URL Supabase

### OTA nie pobiera się po `eas update`

- Binary bez `expo-channel-name=production` (zbudowany przed konfiguracją kanału) → wykonaj Ścieżkę B
- Niezgodny `runtimeVersion` → bump + Ścieżka B albo publikuj na właściwy runtime
- Zły kanał w komendzie → użyj `--channel production`
- Update nie zastosowany → force quit ×2

## 23. Rollback i odtwarzanie

- **Kod:** wróć do poprzedniego commita (`git checkout` / nowy branch z tagu) — **bez** `git reset --hard` na współdzielonych branchach bez uzgodnienia; nie usuwaj lokalnych zmian użytkownika automatycznie
- **OTA:** opublikuj poprzedni / poprawiony bundle przez `eas update` (lub wycofaj update w dashboardzie EAS, jeśli dostępne)
- **Konfiguracja natywna:** przywróć poprzednie `Info.plist` / `pbxproj` / `Expo.plist` z Gita
- **Build ASC:** nie można nadpisać już wysłanego numeru buildu — wyślij poprawkę z **wyższym** build number
- **TestFlight:** w grupie testerów usuń / wyłącz build lub przestań zapraszać (ASC → TestFlight → grupa → Builds)
- **Historia:** zachowaj wiersze w rejestrze wydań i tagi Gita

## 24. Rejestr wydań

Kopiuj wiersz po każdym uploadzie binary **lub** po OTA:

| Data | Wersja | Build / Update | Commit | Ścieżka (A OTA / B Xcode) | Środowisko | Status | Uwagi |
| ---- | ------ | -------------- | ------ | ------------------------ | ---------- | ------ | ----- |
| 2026-07-25 | 1.0.3 | 3 | `ba9750d` | B | production | uploaded ASC | capture attempt + Replay×1 10min + Unlimited; Supabase migracje+EF; dSYM warnings prebuilt frameworks; Internal QA po Processing |
| 2026-07-25 | 1.0.3 | 2 | `29759c4` | B | production | uploaded ASC | media pipeline + OTA channel production; dSYM warnings prebuilt frameworks; Internal QA po Processing |
| | 1.0.3 | | | B | production | | lokalny Xcode |
| | 1.0.3 | OTA | | A | production | | eas update |

Powiązane materiały:

- What to Test: [`internal-testflight-what-to-test.md`](./internal-testflight-what-to-test.md)
- Informacje testowe ASC: [`testflight-test-information.md`](./testflight-test-information.md)
- Bare workflow / smoke: [`development-workflow.md`](./development-workflow.md)
- Push: [`push-notifications.md`](./push-notifications.md)

---

## Checklista szybkiego release binary (kopiuj)

```text
[ ] Potwierdzono: potrzebny nowy binary (nie wystarczy OTA — sekcja 2)
[ ] git status czysty; właściwy branch; zanotowany SHA
[ ] npm ci
[ ] npx pod-install ios
[ ] .env produkcyjne (EXPO_PUBLIC_SUPABASE_URL + ANON_KEY); brak service role w bundlu
[ ] npm run typecheck && npm run lint && npm test
[ ] npm run check-knip && npm run expo-doctor && npm run expo-install-check
[ ] npm run check:ios-config && npm run check:sentry-disabled
[ ] Expo.plist: channel=production, runtimeVersion zgodny z app.json
[ ] (opcjonalnie) npm run doctor:react:ci && npm run export:production
[ ] ASC: ostatni build dla tej wersji → zwiększony CFBundleVersion + CURRENT_PROJECT_VERSION
[ ] Smoke Release na fizycznym iPhonie
[ ] open ios/NiX.xcworkspace → schemat NiX → Any iOS Device → Archive
[ ] Organizer: wersja / build / Bundle ID OK
[ ] Distribute → App Store Connect → Upload (sukces w Xcode)
[ ] TestFlight: Processing zakończone; grupa; What to Test
[ ] Weryfikacja aps-environment=production na IPA (push)
[ ] Wpis w rejestrze wydań
```
