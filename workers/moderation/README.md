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

Status: **offline tests cover live F0 client + Storage download**. Live daemon
`main.ts` must not run against production Analyze until a host with ffmpeg is
authorized. `pre_delivery_moderation_enabled` remains **FALSE**. Media jobs
download from private bucket `media-vault` to `$TMPDIR/nix-moderation/<jobId>`
(never a URL to ffmpeg). Fail-closed: missing asset, deleted object, traversal,
remote URL, 404, empty or oversized body.

Dodane:

| Moduł | Rola |
| --- | --- |
| `fake-provider.ts` | Atrapa text/image; lokalny licznik txn |
| `download.ts` | Stream download z limitem 100 MiB; Storage `media-vault`; zakaz URL dla ffmpeg |
| `azure-provider.ts` | Live F0 client (fail-closed 429/5xx); nieużywany przy pustej kolejce |
| `main.ts` | Daemon PostgREST + resolve text/media; `MODERATION_WORKER_ONCE=1` |
| `budget.ts` | Ledger pamięciowy (testy) lustrzany do SQL |
| `process.ts` | Dispatch text / image / video + rezerwacja budżetu |
| `memory-queue.ts` | Kolejka in-memory pod testy integracyjne |
| `shutdown.ts` | Controlled stop + orphan `nix-frame-*` cleanup |
| `createIntegrationWorker` | Pełny tick + recovery approve→materialize |

Migracje lokalne (nie pushować na prod):

- `supabase/migrations/20260831150000_pre_delivery_moderation_f0_budget.sql`
- `supabase/migrations/20260904120000_c3b_audit_complete_and_budget.sql` (REVOKE complete, lease recovery, attempt terminal semantics)

Dodane (C3B audit / izolowany runner):

- `scripts/lib/safe-psql-env.mjs` — strip wszystkich `PG*` przed spawn `psql`
- `npm run test:c3b-isolated-migrations` — disposable Docker `:15432`, tight egress + probe, sentinel `C3B_ISOLATED_RUN_ID`, pgTAP F0/complete/grants + DIRECT race
- Isolated PASS **nie** zastępuje project `supabase db reset` (Storage stub + auth column compat)

Zobacz też [`docs/plans/2026-09-04-c3b-audit-fixes.md`](../../docs/plans/2026-09-04-c3b-audit-fixes.md).

- hard budget **4000**, `external_used`, osobne liczniki text/image
- `reserve` / `confirm` / `release_if_unused` (niepewny wynik nie zwalnia; confirmed/released attempt nie daje free retry)
- `waiting_reason = f0_budget_exhausted`, rollover miesiąca UTC
- claim default **limit 1 / lease 900 s**
- `materialized_at` + `claim_approved_unmaterialized_*` (bez kradzieży aktywnego lease)

Rate: F0 Moderation APIs = **5 RPS**; worker używa min. odstępu 200 ms.

### Rollback (C3B)

1. Nie włączać flagi `pre_delivery_moderation_enabled`.
2. Zatrzymać proces `workers/moderation` (shutdown → brak nowych claim).
3. **Nie** aplikować migracji C3B na produkcję; lokalnie:
   `supabase db reset` albo ręczne `DROP` ledger/RPC z migracji `…150000`.
4. Contract SQL (`…140000`) pozostaje niewdrożony na prod w tej fazie.
5. Historyczne dowody C2/C3A w `~/.nix-ops/` zostawić bez zmian.

### Host (flaga nadal OFF)

C3 schema jest na produkcji. Benchmark C3A był `network=none` / 0 Azure.
Idle daemon (egress do PostgREST + Azure, **bez** publikacji portów):

```sh
# env-file mode 600 poza Git: AZURE_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# MODERATION_EXTERNAL_USED=3630 — bez MODERATION_WORKER_ONCE
export NIX_MODERATION_ENV_FILE=/path/to/moderation-worker.env
export NIX_MODERATION_IMAGE_TAG=local
docker compose -f workers/moderation/compose.yaml up -d --build
```

Pusta `moderation_jobs` + flaga FALSE = 0 Azure Analyze. Nie włączać flagi
tylko dlatego, że kontener wstaje.

### Poza C3B (osobna zgoda)

- Uzgodnienie danych C2 z Azure
- Potwierdzenie subskrypcji po 1 października
- Staging / ograniczony test live / produkcja

## Recorded C3A result

Benchmark source: `a4ad3f7a5668edeb37d58eb62e7959cadacff750`.
10/10 cases passed; zero Azure requests. Historical results are immutable.
