# Theme Guidelines (systemowy motyw iOS + Android)

> **Wyznacznik platformowy:** Kolory i typografia muszą odzwierciedlać **systemowy motyw urządzenia** na iOS i Android — nie własny „brand skin” niezależny od platformy. Zasada native-first: [native-platform-guidelines.md](./native-platform-guidelines.md).

Ten projekt używa systemowego motywu (`light`/`dark`, `userInterfaceStyle: automatic`) i mapuje go na tokeny kolorystyczne w jednym miejscu. Tokeny obejmują role znane z iOS Human Interface Guidelines; na Androidzie ten sam zestaw zapewnia spójny, systemowy wygląd w ramach warstwy `@expo/ui` (Jetpack Compose).

## Źródło prawdy

- Tokeny kolorów: `src/theme/colors.ts`
- Presety akcentu: `src/theme/accent-presets.ts`
- Preferencja akcentu (AsyncStorage): `src/lib/accentPreference.ts`
- Role typografii: `src/theme/typography.ts`
- Provider i kontekst motywu: `src/theme/theme-context.tsx`
- Hook do użycia w ekranach: `src/hooks/useAppTheme.ts`

## Personalizacja akcentu

Dozwolona jest **wyłącznie** personalizacja tintu interaktywnego przez stałe presety (ekran Profil → Wygląd):

- Nadpisywane tokeny: `accent`, `systemBlue` i `info` (zawsze z tego samego koloru presetu).
- **Nie** zmieniaj: tła, labele, destructive, success/warning/error, `buttonPrimaryBg`.
- Light/dark **zawsze** z systemu — aplikacja nie wymusza trybu jasnego/ciemnego.
- Preferencja jest lokalna na urządzeniu (AsyncStorage); bez sync konta w v1.

## Zasady użycia

- Nie wpisuj kolorów na sztywno w ekranach i komponentach.
- W każdym ekranie pobieraj `const { colors, statusBarStyle } = useAppTheme()`.
- Używaj semantycznych pól tokenów:
  - `background`, `surface`, `surfaceAlt`
  - `textPrimary`, `textSecondary`, `textMuted`
  - `border`, `borderStrong`
  - `accent`, `success`, `warning`, `error`, `info`
  - `buttonPrimaryBg`, `buttonPrimaryText`
  - role iOS (mapowane systemowo na obu platformach): `label`, `secondaryLabel`, `tertiaryLabel`, `systemBackground`, `secondarySystemBackground`, `separator`, `systemFill`, `systemBlue`, `destructive`
- Dla elementów interaktywnych (tab tint, unread, checkmark, CTA link, header back/tint, toolbar icons) preferuj `colors.accent` lub `colors.systemBlue` — po wyborze presetu są tożsame z `info`.
- Tytuły headerów i labele tekstowe: `colors.label` (nie akcent).
- Chrome kamery / preview: `colors.cameraControlTint` — nie podmieniaj na accent.
- Używaj ról z `typography` (`largeTitle`, `title2`, `headline`, `body`, `callout`, `footnote`, `caption`) zamiast lokalnych rozmiarów tekstu, jeśli ekran nie ma wyjątkowego powodu.
- Komponenty `@expo/ui` (`Text`, `Button`, `TextInput`) preferuj nad ręcznie stylowanym RN `Text` tam, gdzie to możliwe — renderują natywną typografię platformy.
- Przed większym refaktorem UI `npm run lint` ma przechodzić bez warningów.

## StatusBar i nawigacja

- `StatusBar` ustawiaj dynamicznie: `style={statusBarStyle}`.
- `headerTintColor` (back / toolbar tint) → `colors.accent`; tytuły → `colors.label`.
- Dla tabów używaj koloru z tokenów (`colors.accent`) zamiast stałych wartości.
- Tab bar: **iOS** `NativeTabs` (`app-tabs-layout.ios.tsx`, ikony bez podpisów); **Android** custom tabs (`FloatingTabBar`, floating pill, ikony bez podpisów). Nie używaj JS `Tabs` z React Navigation do głównej nawigacji.

## Checklista dla nowego ekranu

1. Dodaj `useAppTheme` i użyj tokenów zamiast heksów.
2. Zadbaj o kontrast tekstu i elementów interaktywnych w obu trybach.
3. Ustaw dynamiczny `StatusBar` jeśli ekran go kontroluje.
4. Sprawdź ekran ręcznie w `light` i `dark` na **iOS Simulator i Android emulatorze**.
5. Przy zmianach tintu: smoke z 2–3 presetami akcentu (np. blue, purple, teal) w light i dark.
