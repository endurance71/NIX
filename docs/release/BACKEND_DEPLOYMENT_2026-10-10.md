# NiX backend deployment — pre-review hardening, 2026-10-10

Status: **DEPLOYED** (Edge Functions, migrations, worker). Post-deploy data checks and build 11 device QA pending.

## Inputs

| Input | Value |
| --- | --- |
| Backend source | `5953ec5ce062dfbd955c75c33016627635153a69` (branch `fix/pre-review-hardening`, [PR #56](https://github.com/endurance71/NIX/pull/56), CI green) |
| Supabase project | `xjdjlxfulpqpundkcdul` |
| Migrations applied | `20261010120000_pre_review_hardening.sql`, `20261010121000_reset_october_f0_external_floor.sql` (history now 50 entries) |
| Edge Functions deployed | `cleanup-text-messages`, `data-export-download`, `process-data-exports`, `delete-account`, `block-user` |
| Worker image | `nix-moderation-worker:28ad67d`, `sha256:502c8b8be389a9e0f3039c1922756402e6632e6105f189a55155e8be0097357f` (env `moderation-worker.docker.env`, quote-free copy) |
| Previous worker | container `nix-moderation-worker-before-20261010` (image `review-20261008`), env backup `moderation-worker.env.before-20261010` on the host |
| Encrypted backup SHA256 | `b20373dda16484d42acfdbb96c804ee8f016f57f43b57ce764f6163eaf0ea42f` (schema, data, roles, all 17 Edge bundles) |
| Deployed at | 2026-10-10 14:34 UTC (worker r2 ~14:40 UTC) |

Receipt, deploy script and encrypted backup are outside Git in `~/.nix-ops/pre-review-hardening-2026-10-10/`.

## Sequence

1. Production schema/data/roles dumped with Supabase CLI 2.120.0; all 17 Edge Functions downloaded. Archive encrypted (AES-256-CBC, PBKDF2 200k), decryption verified, plaintext removed.
2. Worker image built on the OVH host from a minimal context while the old worker kept running.
3. Old worker stopped and renamed; worker env set to `MODERATION_EXTERNAL_USED=0` (October has no Azure usage outside the ledger). Pre-delivery moderation stayed enabled; clients kept queuing.
4. Five Edge Functions deployed with `--use-api`.
5. Dry run listed exactly the two migrations; both applied.
6. New worker started with the previous hardening (read-only root, 512 MiB noexec tmpfs, 1 CPU / 1 GiB, pids 128, cap-drop ALL, no-new-privileges, bounded logs, no published ports).

## Incident during rollout

The first image (`5953ec5`, `sha256:271d0d84…`) restart-looped with `Permission denied` on `/app/workers/moderation/main.ts`: the build context was copied under `umask 077`, so uid 10001 could not read the sources. Moderation was paused from step 3 until a rebuild with `chmod -R a+rX` (`5953ec5-r2`) verified `READ_OK` as uid 10001 and started with 0 restarts. Queued jobs stayed pending and nothing was delivered without approval. The deploy script now normalizes context permissions before upload.

## Incident 2 — no delivery after the rollout

From about 17:03 UTC every claimed moderation job crashed the worker, so nothing was approved or delivered:

- The container was created with `docker run --env-file`. Unlike `docker compose`, which started the previous worker, it keeps the quotes around values, so the Azure endpoint and key arrived as `'https://…'`. Every Azure call failed as `provider_network`.
- That fast failure settled while the budget confirmation was still in flight. The rejection had no handler yet, so Deno exited, and the job was re-claimed only after its 15-minute lease.

Fix: commit `28ad67d` observes the provider promise immediately, with a regression test. The image was built from that commit only and started with a quote-free env copy after an Azure reachability check (HTTP 401 without key). The worker then ran with 0 restarts. Jobs created within the last 24 hours are processed again; older ones end through the existing quarantine.

## Still to verify

- F0 ledger row `2026-10`: `external_used = 0`; moderation jobs created during the pause reach `approved`/`rejected`.
- `get_advisors` (security/performance) after the policy and grant changes.
- Email templates, AASA `/auth/confirm*` and the `/auth/confirm` fallback page ship together with build 11 (build 10 keeps working through the 6-digit code).

## Rollback

Worker: stop/remove `nix-moderation-worker`, restore the env backup, rename and start `nix-moderation-worker-before-20261010`. Migrations are forward-only, consistent with the 2026-10-09 procedure: repair forward, never revert security migrations.
