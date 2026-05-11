# react-doctor — baseline (referencyjny)

- Data początkowa: 2026-05-10 — wynik **81 / 100** (95 issues / 41 plików).
- Po wdrożeniu planu napraw (ten sam dzień): **89 / 100** (`npm run react-doctor:score`).
- Kompleksowa naprawa (deep link / AppState / stan / knip / routing kamery): **2026-05-11 — 94 / 100**, **25 issues / 14 plików** (pełny audyt `npm run react-doctor`).
- Docelowy audyt (viewer / kamera / profil: hooki `use*` + powierzchnie UI, style w osobnych plikach, refaktor sekwencyjnego `await` bez pętli z `await`): **2026-05-11 — 100 / 100**, **0 issues** (pełny audyt `npm run react-doctor`).
- Pełny audyt: `npm run react-doctor` (alias na `npx -y react-doctor@latest . --verbose`).
- Skan tylko zmian na gałęzi: `npm run react-doctor:diff`.
- Regresje dead code (pliki): `npm run knip` — konfiguracja w [`knip.json`](../knip.json) (eksporty typów wyłączone z gate’a).

Próg regresji: utrzymać wynik **≥ 100** (lub nie zejść poniżej ostatniego zapisu w tym pliku po kolejnych audytach).
