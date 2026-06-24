# Theme Guidelines (systemowy motyw iOS + Android)

> **Wyznacznik platformowy:** Kolory i typografia muszą odzwierciedlać **systemowy motyw urządzenia** na iOS i Android — nie własny „brand skin” niezależny od platformy. Zasada native-first: [native-platform-guidelines.md](./native-platform-guidelines.md).

Ten projekt używa systemowego motywu (`light`/`dark`, `userInterfaceStyle: automatic`) i mapuje go na tokeny kolorystyczne w jednym miejscu. Tokeny obejmują role znane z iOS Human Interface Guidelines; na Androidzie ten sam zestaw zapewnia spójny, systemowy wygląd w ramach warstwy `@expo/ui` (Jetpack Compose).

## Źródło prawdy

- Tokeny kolorów: `src/theme/colors.ts`
- Role typografii: `src/theme/typography.ts`
- Provider i kontekst motywu: `src/theme/theme-context.tsx`
- Hook do użycia w ekranach: `src/hooks/useAppTheme.ts`

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
- Używaj ról z `typography` (`largeTitle`, `title2`, `headline`, `body`, `callout`, `footnote`, `caption`) zamiast lokalnych rozmiarów tekstu, jeśli ekran nie ma wyjątkowego powodu.
- Komponenty `@expo/ui` (`Text`, `Button`, `TextInput`) preferuj nad ręcznie stylowanym RN `Text` tam, gdzie to możliwe — renderują natywną typografię platformy.
- Przed większym refaktorem UI `npm run lint` ma przechodzić bez warningów.

## StatusBar i nawigacja

- `StatusBar` ustawiaj dynamicznie: `style={statusBarStyle}`.
- Dla tabów używaj koloru z tokenów (`colors.accent`) zamiast stałych wartości.
- Tab bar: `NativeTabs` — nie nadpisuj wyglądu JS tab barem odcinającym się od systemu.

## Checklista dla nowego ekranu

1. Dodaj `useAppTheme` i użyj tokenów zamiast heksów.
2. Zadbaj o kontrast tekstu i elementów interaktywnych w obu trybach.
3. Ustaw dynamiczny `StatusBar` jeśli ekran go kontroluje.
4. Sprawdź ekran ręcznie w `light` i `dark` na **iOS Simulator i Android emulatorze**.
