# react-doctor — baseline (referencyjny)

> **Wyznacznik platformowy:** Wynik react-doctor nie zastępuje weryfikacji **natywnego UI na iOS i Android**. Przy zmianach komponentów sprawdź [native-platform-guidelines.md](./native-platform-guidelines.md).

- Data początkowa: 2026-05-10 — wynik **81 / 100** (95 issues / 41 plików).
- Po wdrożeniu planu napraw (ten sam dzień): **89 / 100** (`npm run react-doctor:score`).
- Kompleksowa naprawa (deep link / AppState / stan / knip / routing kamery): **2026-05-11 — 94 / 100**, **25 issues / 14 plików** (pełny audyt `npm run react-doctor`).
- Docelowy audyt (viewer / kamera / profil: hooki `use*` + powierzchnie UI, style w osobnych plikach, refaktor sekwencyjnego `await` bez pętli z `await`): **2026-05-11 — 100 / 100**, **0 issues** (pełny audyt `npm run react-doctor`).
- Audyt po włączeniu React Compiler, Reanimated 4 `.get()/.set()`, bare workflow (`android/` + `ios/`) i react-doctor **v0.5.8**: **2026-06-23 — 100 / 100**, **0 issues** (`npm run react-doctor:score`). Expo Doctor: **20/20** (`npx expo-doctor@latest`, `appConfigFieldsNotSyncedCheck` wyłączony dla bare). Gate PR: `npm run lint`, `npm run typecheck`, `npm test`, `npx expo-doctor@latest`, `npm run react-doctor:score`.
- Reaudyt po konsolidacji źródła builda `1.0.11 (5)`: **2026-08-31 — 100 / 100**, **0 issues / 418 plików**, react-doctor **v0.9.12** (`npm run doctor:react:ci`). Osobny design audit: **0 issues**. Dwa wąskie wyjątki są udokumentowane w `doctor.config.ts`: imperatywne `Image.getSize` bez renderowania oraz sekwencyjne porcje Supabase Storage po 1000 ścieżek. Czysta czerń transient bootstrap screen pozostaje świadomą powierzchnią OLED.
- Pełny audyt: `npm run doctor:react`.
- Blokujący gate pełnego repo: `npm run doctor:react:ci`.
- Skan tylko regresji względem `origin/main`: `npm run doctor:react:changed`.
- Regresje dead code (pliki): `npm run check-knip` — konfiguracja w [`knip.json`](../knip.json) (eksporty typów wyłączone z gate’a).

Aktualna bramka wymaga **0 błędów i 0 ostrzeżeń** w pełnym skanie. Historyczne wyniki punktowe dotyczą podanych wersji narzędzia; nie zastępują kontroli diagnostyki i kompletności skanu.

## Aktualizacja 2026-10-08

React Doctor 0.9.17 dodał analizę złożoności funkcji. Początkowy pełny skan wykrył 24 ostrzeżenia w 20 plikach. Refaktoryzacja wszystkich wskazanych funkcji zakończyła się wynikiem **0 błędów, 0 ostrzeżeń**: 546 plików, `complete: true`, brak pominiętych kontroli. Zachowano konfigurację wyjątków i hash filtrów źródeł; wszystkie 534 pliki początkowego skanu są nadal analizowane. Nowe funkcje i testy również obejmuje skan.

`doctor:react:ci` oraz `doctor:react:changed` działają bez `--baseline` i blokują ostrzeżenia przez `--blocking warning`. Workflowy nie nadpisują już tego progu wartością `error`. Plik `quality/react-doctor-complexity-baseline.json` pozostaje wyłącznie historycznym dowodem audytu. W tym uruchomieniu `--no-telemetry` wyłącza API punktacji, dlatego `score: null`; nie deklarujemy wyniku 100/100.

Raport wdrożenia i zakres QA: [REACT_DOCTOR_ZERO_2026-10-08.pl.md](./REACT_DOCTOR_ZERO_2026-10-08.pl.md). Surowe raporty: [przed refaktoryzacją](./quality/react-doctor-before-2026-10-08.json), [końcowy pełny skan](./quality/react-doctor-zero-2026-10-08.json).

Nowe wyjątki dla sekwencyjnych operacji zostały przejrzane w kodzie: usuwanie wpisów SQLite i izolacja kluczy, autoryzacja przed odszyfrowaniem, uporządkowane RPC czyszczenia oraz walidacja pliku przed utworzeniem lokalnego miejsca pobrania. Konfiguracja opisuje każdy zakres. Samo równoległe wykonanie tych operacji zmieniłoby zachowanie.
