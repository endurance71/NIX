# C3A / C3B: moderation worker runtime

## C3A (historyczne)

Status: C3A offline benchmark PASS (2026-09-03), experimental, offline only.
Dowody: `~/.nix-ops/p0-3-worker-runtime/` (nie nadpisywać). ADR-001 nie zmienione.

`core.ts` `createWorker` — single-flight, claim 1, lease 900 s, timeout 600 s.
`video.ts` — 100 MiB / 180 s / max 120 hybrid frames, klatka po klatce + cleanup.

```sh
deno test --no-config --allow-read --allow-write --allow-run workers/moderation
```

## C3B — offline integration (ta gałąź)

Status: **offline only**. `pre_delivery_moderation_enabled` pozostaje **FALSE**.
ADR-001 pozostaje **Proposed**. Zero wywołań Azure w testach
(`FakeAzureProvider` / `createFakeProvider`).

Dodane:

| Moduł | Rola |
| --- | --- |
| `fake-provider.ts` | Atrapa text/image; lokalny licznik txn |
| `download.ts` | Stream download z limitem 100 MiB; zakaz URL dla ffmpeg |
| `budget.ts` | Ledger pamięciowy (testy) lustrzany do SQL |
| `process.ts` | Dispatch text / image / video + rezerwacja budżetu |
| `memory-queue.ts` | Kolejka in-memory pod testy integracyjne |
| `shutdown.ts` | Controlled stop + orphan `nix-frame-*` cleanup |
| `createIntegrationWorker` | Pełny tick + recovery approve→materialize |

Migracja lokalna (nie pushować na prod):
`supabase/migrations/20260831150000_pre_delivery_moderation_f0_budget.sql`

- hard budget **4000**, `external_used`, osobne liczniki text/image
- `reserve` / `confirm` / `release_if_unused` (niepewny wynik nie zwalnia)
- `waiting_reason = f0_budget_exhausted`, rollover miesiąca UTC
- claim default **limit 1 / lease 900 s**
- `materialized_at` + `claim_approved_unmaterialized_*`

Rate: F0 Moderation APIs = **5 RPS**; worker używa min. odstępu 200 ms.

### Rollback (C3B)

1. Nie włączać flagi `pre_delivery_moderation_enabled`.
2. Zatrzymać proces `workers/moderation` (shutdown → brak nowych claim).
3. **Nie** aplikować migracji C3B na produkcję; lokalnie:
   `supabase db reset` albo ręczne `DROP` ledger/RPC z migracji `…150000`.
4. Contract SQL (`…140000`) pozostaje niewdrożony na prod w tej fazie.
5. Historyczne dowody C2/C3A w `~/.nix-ops/` zostawić bez zmian.

### Poza C3B (osobna zgoda)

- Uzgodnienie danych C2 z Azure
- Potwierdzenie subskrypcji po 1 października
- Staging / ograniczony test live / produkcja

## Recorded C3A result

Benchmark source: `a4ad3f7a5668edeb37d58eb62e7959cadacff750`.
10/10 cases passed; zero Azure requests. Historical results are immutable.
