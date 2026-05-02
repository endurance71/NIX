# Changelog

## 2026-04-29

- Ustabilizowano routing aplikacji przez guard sesji i onboardingu.
- Usunięto mock users z flow wysyłki i podłączono listę realnych profili.
- Wydzielono warstwę `services` dla auth/profiles/snaps/media.
- Dodano minimalne testy jednostkowe dla auth i upload (`vitest`).
- Uporządkowano artefakty repo (duplikat dokumentacji root, `.DS_Store`, stare entrypointy template).
