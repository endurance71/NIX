# NiX backend deployment — feature wave for 1.0.13 (12), 2026-10-11

Status: **DEPLOYED** (migrations, Edge Functions). Moderation worker unchanged. Device QA on 1.0.13 (12) pending.

## Inputs

| Input | Value |
| --- | --- |
| Backend source | `385379c96782ec16f00fa8aed476ec92beecc84c` (branch `fix/app-cleanup-stage1`, merged with `fix/pre-review-hardening`) |
| Supabase project | `xjdjlxfulpqpundkcdul` |
| Migrations applied | `20261011100000` … `20261012120000` (15 files; history now 66 entries, local = remote) |
| Edge Functions deployed | `push-dispatch`, `push-receipts`, `report-content`, `moderation-admin`, `begin-media-upload`, `cleanup-moderation-evidence`, `cleanup-text-messages` |
| Worker | not redeployed (`nix-moderation-worker:28ad67d` keeps running; the branch only adds an optional loop optimisation) |
| Encrypted backup SHA256 | `0b135da1692c3a9d56c4cbb3b9c1082024f04ef60b42d984c888bfe996e78467` (schema, data, roles, all 17 Edge bundles) |
| Deployed at | 2026-10-11 08:05 UTC |

Receipt, logs and the encrypted backup are outside Git in `~/.nix-ops/feature-wave-2026-10-11/`.

## Compatibility review

Before the rollout every redefined function, policy, trigger, cron job and storage policy was compared with the previous
definitions and with the call sites of the shipped clients (builds 10/11), the deployed Edge Functions and the running
worker. No blocker. Applied recommendations: migrations before Edge Functions (the new `begin-media-upload` and
`cleanup-text-messages` need the new schema), `lock_timeout = 5s` in every migration, and direct text inserts may not
pre-set `read_at`.

Behaviour that builds 10/11 now see: voice messages appear as their text placeholder („🎤 0:12”), saved messages do
not expire after 24 h, their reads fill `read_at` (new senders see „Opened”), streaks count for everyone.

## Sequence

1. Production schema/data/roles dumped with Supabase CLI 2.120.0; all 17 Edge Functions downloaded; archive encrypted
   (AES-256-CBC, PBKDF2 200k), decryption verified, plaintext removed.
2. The remote history contained `20261010130000_cancel_own_text_moderation_job` (build 11 branch), missing from this
   branch: `fix/pre-review-hardening` was merged first so the history and the build-11 feature stay intact.
3. Dry run listed exactly the 15 new migrations; all applied.
4. Seven Edge Functions deployed with `--use-api`.

## Rollback

Migrations are forward-only (repair with a new migration). Edge Functions: redeploy the bundles from the encrypted backup.
