# Design by Apple — materiał referencyjny

Ten folder zawiera **prompty designerskie** w stylu Apple Human Interface Guidelines (HIG). Służą do pracy koncepcyjnej z AI (design system, brand, UI patterns) — **nie są operacyjnymi wytycznymi implementacji w kodzie**.

## Relacja do implementacji NiX

| Ten folder | Implementacja w repo |
| :--- | :--- |
| Inspiracja wizualna iOS / Apple HIG | [native-platform-guidelines.md](../native-platform-guidelines.md) |
| Prompty do generowania koncepcji UI | Universal `@expo/ui` (SwiftUI + Jetpack Compose) |
| Skupienie na iOS w promptach | Produkt docelowy: **iOS i Android** z natywnym feel per platforma |

Przy implementacji ekranów i komponentów zawsze stosuj:

- [native-platform-guidelines.md](../native-platform-guidelines.md) — naczelny wyznacznik native-first
- [theme-guidelines.md](../theme-guidelines.md) — tokeny motywu systemowego
- [NiX_Documentation_v1.2.md](../NiX_Documentation_v1.2.md) §2.2 — filozofia `@expo/ui`

## Pliki

| Plik | Opis |
| :--- | :--- |
| [prompt-apple.md](./prompt-apple.md) | Eksport promptów (m.in. do Obsidian) |
| [Design - apple prompt.md](./Design - apple prompt.md) | Pełna wersja 10 promptów Apple-style |

Nie modyfikuj treści promptów pod kątem Androida — to materiał referencyjny HIG. Równoległe wytyczne Material / Compose dla dev są w dokumentacji native-first.
