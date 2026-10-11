-- One-off data fix (2026-10-10).
--
-- Until the worker fix in this release, every reservation sent the September
-- MODERATION_EXTERNAL_USED value (3630), so the first reservation of October
-- seeded 2026-10 with September's external Azure usage. Azure Monitor shows
-- only a few dozen October calls, all of them already counted by this ledger,
-- so October has no external usage. The guard on the exact seeded value keeps
-- this a no-op anywhere else (local, CI, or if the row was corrected by hand).
--
-- Apply only after the old worker is stopped: it would raise the value again.
UPDATE private.moderation_f0_ledger
SET external_used = 0,
    updated_at = NOW()
WHERE month_key = '2026-10'
  AND external_used = 3630;
