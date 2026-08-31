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

Próg regresji: utrzymać wynik **≥ 100** (lub nie zejść poniżej ostatniego zapisu w tym pliku po kolejnych audytach).
