# Changelog

## 2026-06-24

- Dodano [`docs/native-platform-guidelines.md`](docs/native-platform-guidelines.md) — źródło prawdy dla zasady **native-first (iOS + Android)**.
- Ujednolicono dokumentację projektu: każdy plik operacyjny w `docs/` oraz `README.md` odnosi się do native-first i wymaga smoke na obu platformach przy zmianach UI.
- Poprawiono niespójność w `NiX_Documentation_v1.2.md` (`platforms: ["ios", "android"]` zgodnie z `app.json`).
- Dodano regułę Cursor [`.cursor/rules/native-platform-first.mdc`](.cursor/rules/native-platform-first.mdc) (`alwaysApply`).
- Dodano [`docs/Design by apple/README.md`](docs/Design%20by%20apple/README.md) — rozróżnienie materiału HIG (referencja) vs wytyczne implementacji.

## 2026-04-29

- Ustabilizowano routing aplikacji przez guard sesji i onboardingu.
- Usunięto mock users z flow wysyłki i podłączono listę realnych profili.
- Wydzielono warstwę `services` dla auth/profiles/nixes/media.
- Dodano minimalne testy jednostkowe dla auth i upload (`vitest`).
- Uporządkowano artefakty repo (duplikat dokumentacji root, `.DS_Store`, stare entrypointy template).
