# Wytyczne platformowe: native-first (iOS + Android)

**Status:** obowiązuje dla całego projektu NiX  
**Ostatnia aktualizacja:** 2026-06-24

---

## Naczelna zasada

**Naczelnym wyznacznikiem jakości, UX i architektury frontendu NiX są natywne rozwiązania platform iOS i Android.**

Każda decyzja projektowa — UI, nawigacja, animacje, media, formularze, listy, ikony, motyw — powinna być oceniana pod kątem pytania:

> *Czy użytkownik na iOS i Android otrzyma doświadczenie zgodne z konwencjami i komponentami swojej platformy?*

Web i rozwiązania „webowe w RN” (ogólne UI-kity, komponenty wyglądające identycznie na obu platformach kosztem natywnego feel) **nie są** punktem odniesienia. Backend (Supabase) jest wspólny; **warstwa prezentacji jest dual-platform native-first**.

---

## Hierarchia wyboru technologii UI

Przy każdej nowej funkcji lub ekranie przechodź listę **od góry** i zatrzymaj się na pierwszej warstwie, która spełnia wymaganie:

| Priorytet | Warstwa | Kiedy |
| :---: | :--- | :--- |
| **1** | **Universal `@expo/ui`** (import z root pakietu) | Domyślnie — jeden kod, pod spodem SwiftUI (iOS) i Jetpack Compose (Android) |
| **2** | **Platform-specific `@expo/ui`** (`@expo/ui/swift-ui`, `@expo/ui/jetpack-compose`) | Gdy universal nie ma komponentu, modyfikatora lub zachowania wymaganego przez HIG / Material |
| **3** | **Moduły Expo / RN z mostem natywnym** | Kamera, wideo, obraz, secure store, screen capture, audio — `expo-*`, `react-native-compressor` itd. |
| **4** | **RN primitives + tokeny motywu** | Tylko tam, gdzie natywna warstwa nie pokrywa przypadku (np. custom overlay kamery, viewer wideo) — z zachowaniem systemowych kolorów i typografii |
| **5** | **Biblioteki community UI** | **Zabronione** jako domyślny wybór (Paper, NativeBase, ogólne „design systemy” RN) |

Szczegóły implementacji universal UI: [NiX_Documentation_v1.2.md §2.2](NiX_Documentation_v1.2.md#22-filozofia-ui-universal-expoui).

---

## Co oznacza „natywne” w NiX

### iOS

- Komponenty renderowane przez **SwiftUI** (`@expo/ui`, `Host`, `FieldGroup`, `List`, `TextInput`, `Button`…).
- Ikony: **SF Symbols** (`Icon.select` z kluczem `ios`; tab bar: `NativeTabs.Trigger.Icon`).
- Nawigacja dolna: **`NativeTabs`** (`expo-router/unstable-native-tabs`) — tylko ikony (`Trigger.Label hidden`), badge na inbox.
- Motyw: **systemowy light/dark** (`userInterfaceStyle: automatic`) — tokeny mapowane na role iOS (`label`, `systemBackground`, `destructive`…).
- Animacje interakcji: **Reanimated 4** na UI thread (nie legacy `Animated` API).
- Gestykulacja: **react-native-gesture-handler** zgodnie z oczekiwaniami iOS.

### Android

- Komponenty renderowane przez **Jetpack Compose** (ten sam universal `@expo/ui`).
- Ikony: **Material Symbols** (`Icon.select` z `import('@expo/material-symbols/….xml')`; tab bar: `AppIcon` w `FloatingTabButton`).
- Nawigacja dolna: **`expo-router/ui` custom tabs** (floating pill, tylko ikony) — API **experimental**; gdy `NativeTabs` nie wystarcza wizualnie.
- Listy ustawień: `FieldGroup` = `LazyColumn` — **bez zagnieżdżania w RN `ScrollView`** i bez sztywnej `height`.
- Motyw: ten sam systemowy light/dark przez tokeny (`useAppTheme`) — wizualnie zgodny z Material / systemowym schematem kolorów urządzenia.
- Build i test: `npm run android` (`expo run:android`), Android Studio SDK 35+.

### Obie platformy

- **Bare workflow** — foldery `ios/` i `android/` w repo; zmiany w `app.json` wymagają `npx expo prebuild --no-install` i review diffu natywnego.
- **Smoke testy manualne** na obu platformach przed merge krytycznych zmian UI (patrz [development-workflow.md](development-workflow.md)).
- **Ikony uniwersalne:** `AppIcon` → `Icon.select` w `src/theme/app-icons.ts` — nigdy mieszać starych API (`@expo/vector-icons`, `SymbolView` do współdzielonego UI).

---

## Obszary objęte zasadą native-first

| Obszar | Natywne podejście w NiX | Dokumentacja |
| :--- | :--- | :--- |
| **Nawigacja** | iOS: `NativeTabs`; Android: custom tabs (`expo-router/ui`) | [NiX_Documentation §2.1](NiX_Documentation_v1.2.md) |
| **Formularze auth / ustawienia** | `AuthFormLayout`, `FieldGroup`, `TextInput` z `@expo/ui` | [development-workflow.md](development-workflow.md), [auth-flow.md](auth-flow.md) |
| **Listy (inbox, profil)** | SwiftUI `List` / Compose listy + `RNHostView` dla wierszy RN | [NiX_Documentation §2.2](NiX_Documentation_v1.2.md) |
| **Motyw i typografia** | Tokeny systemowe, `useAppTheme()` | [theme-guidelines.md](theme-guidelines.md) |
| **Kamera i media** | `expo-camera`, `expo-video`, `expo-image`, `react-native-compressor` | [video-pipeline.md](video-pipeline.md) |
| **Capture protection** | `expo-screen-capture` (API platformowe) | [capture-protection.md](capture-protection.md) |
| **QR / skaner** | `expo-camera` / natywne uprawnienia per platforma | [friend-invites-qr.md](friend-invites-qr.md) |
| **Animacje** | Reanimated 4 + Gesture Handler | [NiX_Documentation §2.6](NiX_Documentation_v1.2.md) |
| **Listy wydajnościowe (wyjątek)** | `@shopify/flash-list` tylko gdzie nie ma natywnej listy `@expo/ui` | [NiX_Documentation §2.1](NiX_Documentation_v1.2.md) |

---

## Antywzorce (zabronione bez wyjątku zatwierdzonego w PR)

- Ogólne UI-kity: React Native Paper, NativeBase, UI Kitten itd.
- `@expo/vector-icons` / Ionicons w nowym kodzie UI.
- `SymbolView` / `expo-symbols` do ikon współdzielonych z Androidem.
- Legacy **`Animated` API** i **`LayoutAnimation`** na gorących ścieżkach (kamera, viewer, przejścia tabów).
- **`FieldGroup` wewnątrz `ScrollView`** lub ze sztywną wysokością.
- Projektowanie „najpierw pod jedną platformę” bez planu weryfikacji na drugiej.
- Traktowanie webowych wzorców (np. generyczny CSS layout) jako wzorca dla mobile.

---

## Kiedy RN primitives są dopuszczalne

RN (`View`, `Pressable`, `ScrollView`, custom `StyleSheet`) używaj **tylko** gdy:

1. Universal lub platform-specific `@expo/ui` nie pokrywa przypadku (np. pełnoekranowy podgląd kamery, custom overlay nagrywania).
2. Komponent jest osadzony w natywnym drzewie przez `RNHostView` / `Host matchContents`.
3. Stylowanie idzie wyłącznie przez **tokeny motywu** (`useAppTheme`), nie hardcoded heksy.
4. Zachowanie zostało sprawdzone na **iOS i Android** (layout, scroll, safe area, klawiatura).

---

## Drzewo decyzyjne (nowy ekran / komponent)

```
Nowy element UI
    │
    ├─ Czy @expo/ui (universal) ma gotowy komponent?
    │     TAK → użyj Host + universal API
    │     NIE ↓
    │
    ├─ Czy wymaga modyfikatora tylko na jednej platformie?
    │     TAK → .ios.tsx / .android.tsx z swift-ui lub jetpack-compose
    │     NIE ↓
    │
    ├─ Czy to media / uprawnienia / hardware?
    │     TAK → moduł Expo z mostem natywnym
    │     NIE ↓
    │
    ├─ Czy to custom layout bez odpowiednika natywnego?
    │     TAK → RN primitive + tokeny + RNHostView jeśli w liście natywnej
    │     NIE → wróć i rozważ ponownie warstwę 1 lub 2
    │
    └─ Przed merge: smoke iOS + Android
```

---

## Checklista PR (UI / UX)

- [ ] Wybrano najwyższą możliwą warstwę natywną (universal `@expo/ui` przed RN primitive).
- [ ] Ikony przez `AppIcon` / `Icon.select` (Android: `FloatingTabBar`; iOS: `NativeTabs.Trigger.Icon`).
- [ ] Kolory i typografia z `useAppTheme()` — bez hardcoded hexów.
- [ ] Brak zagnieżdżonego scrolla `FieldGroup` w `ScrollView`.
- [ ] Animacje na Reanimated 4 (bez `Animated` / `LayoutAnimation` na hot path).
- [ ] Manualny smoke na **iOS Simulator** i **Android emulator / urządzenie**.
- [ ] Light i dark mode na obu platformach (tam gdzie ekran ma motyw).

---

## Powiązane dokumenty

- [NiX_Documentation_v1.2.md](NiX_Documentation_v1.2.md) — PRD + TDD, filary produktu
- [development-workflow.md](development-workflow.md) — gate jakości, bare workflow, testy dymne
- [theme-guidelines.md](theme-guidelines.md) — tokeny motywu systemowego
- [Expo UI — dokumentacja SDK](https://docs.expo.dev/versions/latest/sdk/ui/)

---

*Niniejszy dokument jest źródłem prawdy dla zasady native-first. Przy sprzeczności z innym plikiem w `docs/` — obowiązuje ten dokument.*
