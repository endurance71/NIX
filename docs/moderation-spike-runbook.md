# P0-3 Azure moderation spike — runbook operacyjny

Dowody (JSON/JSONL/MD/logi) wyłącznie w `~/.nix-ops/p0-3-spike/`.
Media kontrolne wyłącznie w `~/.nix-ops/p0-3-fixtures/` — **nigdy** w katalogu dowodów ani w Git.

## Wymagania wstępne

1. Azure AI Content Safety **F0** w **Sweden Central** (sekrety w `~/.nix-ops/azure-content-safety/env`).
2. Brak SKU **S0**. Potwierdź w Portalu: resource name, region, SKU, bieżące użycie miesięczne, właściciel billingu — zapisz w `resource-metadata.json` **bez** sekretów.
3. `ffmpeg` / `ffprobe` w PATH.
4. Twardy budżet operacyjny: **4000** txn/mies. (z 5000 F0; 1000 = nietykalna rezerwa).

## Fixture’y (lokalnie, 0 PLN)

```bash
npm run spike:moderation-fixtures
# Opcjonalnie high-risk (wymaga wcześniej zwalidowanego reject JPEG):
export SPIKE_JPEG_REJECT="$HOME/.nix-ops/p0-3-fixtures/reject/reject.jpg"
npm run spike:moderation-fixtures
```

Kontrolne długości: **14,9 / 59,9 / 179,9 s** (wiadra uniform 12/24/60 bez overshoot kodeka).

## Dry-run (obowiązkowy przed live)

```bash
source ~/.nix-ops/azure-content-safety/env
export SPIKE_DRY_RUN=1
export SPIKE_MODE=all          # text|image|video|all
export SPIKE_CASE_SET=safe     # safe|text|reject-image|highrisk-start|highrisk-mid|highrisk-end|highrisk-scene
export SPIKE_STRATEGY=all
export SPIKE_F0_USED_BEFORE=<Portal monthly txn>
export SPIKE_JPEG=.../safe/safe.jpg
export SPIKE_JPEG_REJECT=.../reject/reject.jpg   # gdy dostępny
export SPIKE_MP4_15=.../safe/safe-14p9.mp4
export SPIKE_MP4_60=.../safe/safe-59p9.mp4
export SPIKE_MP4_180=.../safe/safe-179p9.mp4
export SPIKE_TEXT_REJECT_FILE=.../reject/reject-texts.txt
export SPIKE_JSONL_OUT="$HOME/.nix-ops/p0-3-spike/runs/dry-run.jsonl"
npm run spike:moderation-provider
```

Live tylko gdy `used_before + estimate + 10% retry reserve ≤ 4000`.
Live musi działać z czystego commita; JSONL zapisuje `codeSha` i
`workingTreeClean=true`. Dowód z brudnego drzewa jest blokowany przed requestem.

## Live-run

```bash
unset SPIKE_DRY_RUN
export SPIKE_F0_USED_BEFORE=<aktualne użycie z Portalu>   # wymagane
# SPIKE_MODE=text działa bez mediów
npm run spike:moderation-provider 2>&1 | tee ~/.nix-ops/p0-3-spike/runs/live-$(date +%Y%m%d).log
```

Oczekiwane decyzje: rozbieżność → exit ≠ 0. Retry 429/5xx sprawdzaj mockowanym `fetch` (`deno:test`), nie celowym 429 na F0.

## Walidacja dowodów

```bash
npm run check:moderation-spike-evidence
# Bramka Accepted (ma obecnie zwracać błąd, dopóki C2 jest niepełne):
npm run check:moderation-spike-evidence -- --require-complete
```

Wymaga: `resource-metadata.json`, `latency-summary.json`, `traffic-forecast.json`, `decision.md`, `runs/*.jsonl`.
Tryb domyślny sprawdza higienę. `--require-complete` dodatkowo sprawdza
semantykę C2: komplet case setów, decyzje/severity, SHA, pełny czas wideo,
rzeczywisty forecast i potwierdzone metadane Portalu.

## Metryki i decyzja ADR

| Metryka | Cel Accepted |
| --- | --- |
| Text recall (PL/EN + obfuskacja) | reject severity ≥4; safe → approved |
| JPEG safe / reject | approved / rejected ≥4 |
| 12× high-risk MP4 (start/mid/end/scene × 3 długości) | pełny recall jak baseline; scene poza anchorami |
| Safe MP4 | brak false reject |
| `uniform` vs baseline | ten sam recall na 12 high-risk **albo** ADR zostaje Proposed |
| p95 całej decyzji wideo | dla uniform 180 s: `5 × p95 × 1,2 < 900 s` (worker claim=5, lease=900 s) |
| Prognoza miesięczna | max(30d, 7d→30d) × koszty jednostkowe + **20% bufor ≤ 4000** |

Po wynikach zaktualizuj ADR-001:

- **Accepted** — wszystkie kryteria + kompletne dowody;
- **Proposed / NO-GO** — brak recall, zły region/SKU, budżet lub niekompletne dowody.

C3, migracje prod i `pre_delivery_moderation_enabled` są **poza** tym etapem.

## Jednorazowe domknięcie C2 na kredycie S0

Historycznych dowodów F0 nie wolno zmieniać. Pełny test S0 zapisuje wyniki w
`~/.nix-ops/p0-3-spike-s0/`, a sekret wyłącznie w
`~/.nix-ops/azure-content-safety-s0/env` z uprawnieniami `0600`.

Warunki przed utworzeniem zasobu:

1. aktywna subskrypcja Free Trial i spending limit;
2. kredyt ważny przez cały test;
3. regionalny koszt 2500 analiz z buforem 20% mniejszy od pozostałego kredytu;
4. osobny zasób `nix-content-safety-c2-s0` w Sweden Central, bez zmiany F0.

Live S0 wymaga `SPIKE_BILLING_TIER=S0`, `SPIKE_TXN_USED_BEFORE`,
`SPIKE_TXN_HARD_BUDGET=2500` oraz `SPIKE_HTTP_ATTEMPTS=1`. Dry-run jest
autorytatywny; jeśli cała macierz z rezerwą 10% przekracza 2500, nie wolno
rozpoczynać live. Każdy 429/5xx kończy przebieg fail-closed bez retry.

Agregaty 7/30 dni pobierać wyłącznie zapytaniem
`scripts/moderation-traffic-aggregates.sql`. Zapytanie nie odczytuje treści,
ścieżek mediów ani identyfikatorów użytkowników.

Po pełnym PASS uruchomić:

```bash
SPIKE_EVIDENCE_DIR="$HOME/.nix-ops/p0-3-spike-s0" \
  npm run check:moderation-spike-evidence -- --require-complete-s0
```

Po zapisaniu metadanych usunąć tymczasowy zasób S0 i plik z kluczem. Nie
przechodzić na Pay-As-You-Go i nie usuwać spending limitu. Produkcyjna flaga
pozostaje wyłączona; uruchomienie C3 wymaga osobnego planu runtime z ffmpeg.

## Stan 2026-09-03

- Spike **uruchomiony** na istniejącym F0 (nie „nieuruchomiony”).
- Pełny S0 C2: techniczny PASS, SHA `e75dd9df570e16b7ee40c7a3cea1b1b85af9d767`.
- 5 safe / 2 reject teksty, safe/reject JPEG, baseline i hybryda po 12/12 high-risk MP4 rejected; safe severity 0.
- 1937 prób (1930 obraz, 7 tekst), bez retry/429/5xx; 44 testy offline PASS.
- p95 trzech safe 180 s hybrydy: 27.405 s; batch z buforem: 164.429 s < 900 s.
- Prognoza z agregatów 7/30 dni: 641 txn/miesiąc z buforem 20% (wariant 120 klatek/film: 2860).
- Szacunek kosztu: 1.450125 USD z kredytu, nie kwota rozliczona przez Azure.
- S0 usunięty po odblokowaniu Maca (odświeżona grupa: zero zasobów); Azure Home potwierdził ochronę kredytu i datę wygaśnięcia 2026-10-01.
- ADR **Proposed** do uzgodnienia dokładnego licznika portalu; lokalny ledger ma 1937 prób, portal nadal pokazywał zaokrąglone i opóźnione 1.23k obrazów.
- Nie ponawiać live. Klucz był tylko w pamięci zakończonego procesu; schowek wyczyszczony, pliku klucza nie tworzono.
- Dowody: `~/.nix-ops/p0-3-spike-s0/`; historyczne katalogi bez zmian.
- C3 i flaga produkcyjna nietknięte. Wynik lokalny nie zastępuje walidacji docelowego runtime ffmpeg.
