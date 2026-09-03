# C3B — offline integration (bez kosztów Azure)

**Status:** implementacja offline / flaga produkcyjna **WYŁĄCZONA** /
ADR-001 nadal **Proposed**. Gałąź: `codex/p0-3-c3b-integration` (baza `4be21b4`).

## Cel

Kompletny przepływ tekst / JPEG / MP4 z kolejką Supabase, atrapą Azure,
trwałym ledgerem F0 (4000), recovery approve→publish oraz testami bez
wywołań sieciowych do Azure.

## Host

Runtime: [`workers/moderation`](../../workers/moderation) (Deno + ffmpeg).
Hosted Edge nie dostarcza ffmpeg — niecommitowany HTTP worker na `main`
pozostaje źródłem wzorców, nie produkcyjnym runtime wideo.

## Zakres wykonany (1–5)

1. Worktree + selektywny import expand/contract/harden/pgTAP.
2. Fake provider, stream download ≤100 MiB, single-flight claim 1 / lease 900 s /
   timeout 600 s, dispatch text/image/video.
3. Migracja lokalna `20260831150000_pre_delivery_moderation_f0_budget.sql`
   (ledger, reserve/confirm/release-if-unused, waiting_reason, recovery).
4. Lease checks, idempotent materialize, orphan cleanup, controlled shutdown.
5. Macierz testów Deno + pgTAP; zero Azure.

## Poza zakresem

- Rozliczenie C2 / Accepted ADR
- S0, zmiana subskrypcji, migracje/`db push` produkcyjne
- `pre_delivery_moderation_enabled = true`
- Staging / produkcja (osobna zgoda)

## Testy lokalne

```sh
# Deno (wymaga ffmpeg w PATH)
deno test --no-config --allow-read --allow-write --allow-run workers/moderation

# Postgres (po supabase start + db reset lokalnie — NIE prod)
supabase test db supabase/tests/pre_delivery_moderation_f0_budget_test.sql
```

## Rollback

Zobacz [`workers/moderation/README.md`](../../workers/moderation/README.md)
sekcja C3B rollback.
