# NiX backend deployment and recovery — 2026-10-09

Status: **DEPLOYED / production API smoke PASS / final binary QA pending**.

## Immutable inputs

| Input | Value |
| --- | --- |
| Backend source | `bbd143643a85665c378d2a197a4020b1f5843642` |
| Client source for current public candidate 10 | `1be78ee517c20a94a7829d15b1e7647bcafe1e3b` |
| Superseded build 9 source (historical) | `859694ad3dab5b2287887ab88019a310952f89e9` |
| Superseded build 8 source (historical) | `1300dc1283eb55434cdfcf3d0100f4ad11141bf3` |
| CI fix/evidence commit | `2c8aae1` |
| Supabase project | `xjdjlxfulpqpundkcdul`, PostgreSQL 17.6, eu-west-1 |
| Forward migration 20261007120000 SHA256 | `aa9f39e21ce829a4d29b1c7c4e538e21af2703a6bac54ce9e1093c785f53741a` |
| Forward migration 20261007121000 SHA256 | `0251ad0987e88b7f434e007b17f0d2095a2d86a8a360870e9a9f0bd7d88f09b9` |
| Worker image | `nix-moderation-worker:review-20261008` |
| Worker image ID | `sha256:8f924da11fecb0bcf3cc22ed3055f06f23163ef20da78df3a9f0432726b86960` |
| Previous stopped container | `nix-moderation-worker-before-20261008` |
| Previous image | `nix-moderation-worker:e1d73cf` |
| Encrypted backend backup SHA256 | `0d0e1000f6725c9cc1581ae453378d1d53a7d4d0d4bf7349290c0e55a8618533` |
| Encrypted worker backup SHA256 | `06b846972d8cbf967a3134114558c0e0f22346c6c86d6a1b9fca39136ae786bc` |

Machine-readable manifest and sensitive restore artifacts are outside Git at `~/.nix-ops/app-review-preparation-2026-10-08/`. The manifest includes function source hashes, prior versions, rollout order and receipts. Credentials, user IDs, Storage paths and decrypted Vault secrets must not be copied into this document or CI output.

## Deployed Edge versions

All 17 functions require JWT validation. Sixteen were deployed from the candidate; `cleanup-snap` was retained unchanged.

| Function | Version |
| --- | --- |
| begin-media-upload | 6 |
| finalize-media-upload | 5 |
| cancel-media-upload | 5 |
| cleanup-media-upload-orphans | 5 |
| cleanup-nix | 9 |
| cleanup-nix-due | 7 |
| cleanup-text-messages | 5 |
| delete-account | 7 |
| report-content | 8 |
| block-user | 7 |
| moderation-admin | 7 |
| cleanup-moderation-evidence | 7 |
| push-dispatch | 16 |
| push-receipts | 7 |
| data-export-download | 6 |
| process-data-exports | 6 |
| cleanup-snap (retained) | 8 |

## Completed sequence and evidence

1. Snapshot production: 46 migrations, 20 users, no pending/processing jobs. Back up schema/data/roles/history, decrypted Vault entries into protected artifacts, 47 Storage files and their hashes, 17 Edge bundles and worker image. Encrypt the backup.
2. Restore schema/data from the encrypted artifact into PostgreSQL 17.6 with no network. All 70 table counts match; apply the forward migrations to restored data. Decrypt Storage bytes, upload them into an isolated private proof bucket and read all 47 back through the real Storage API: 29,183,942 bytes, every SHA256 matches. This validates object recovery separately from the restored database; production credentials/integrations are not activated in the restore environment.
3. Full separate staging with real Auth/Storage/TUS and the candidate worker image, fake Azure with zero external calls. Rehearse new Edge code against the old schema, seed three pending jobs, apply both migrations, resume worker; all jobs survive and deliver. Report/block/delete also pass.
4. Stop only the NiX worker on OVH; leave pre-delivery moderation enabled. Deploy 16 functions with the authenticated Supabase CLI API. Apply exactly the two planned forward migrations; history now has 48 entries.
5. Keep the old container stopped under its recovery name. Start the exact tested image with existing production secrets, read-only filesystem, 512 MiB tmpfs, no additional capabilities, no-new-privileges, bounded resources/logs and no published ports.
6. Disposable production accounts: email authentication/age attestation, accepted relationship, text/photo/video moderation and delivery, TUS, idempotency, immutable approved bytes, report/block and deletion PASS. Remove only these accounts through the application endpoint. Original users and reviewer accounts preserved.
7. Post-smoke observation: pending/processing 0, cleanup backlog 0, old error count 3 unchanged, worker running with zero restarts. Recent scheduled cleanup/push/export invocations succeeded. Authentication and endpoint smoke responses were checked separately.

GitHub Auth/Storage A/B, migration/runtime/Swift jobs: [run 37832523483](https://github.com/endurance71/NIX/actions/runs/37832523483). EAS quality gates: run `01a11cff-3be1-7bdf-95e7-ef7f2c2d97ed`, PASS.

Azure F0 smoke consumed **15 transactions**, exceeding the planned test cap of 8 because video sampling selected 13 frames. Actual consumption is recorded rather than rewriting the planned cap. After smoke: 64 consumed, 3630 operational external floor, hard ceiling 4000, zero reserved, 306 conservative remaining. No further Azure smoke was run.

## Recovery procedure

For delivery/provider/schema failures, first stop `nix-moderation-worker` on `ovh-vps-cursor`. Leave `pre_delivery_moderation_enabled=true`, the new Storage grants/RLS/immutability and the content checks in place. Clients retain queued jobs and retry; unapproved content must not be materialized directly.

Capture current pending/processing leases, worker logs, function versions and error counts privately. Diagnose and forward-fix against the isolated real Auth/Storage suite and hardened schema. Deploy compatible functions, then restart a verified worker image and observe delivery/cleanup again. A stopped old container and archived Edge bundles are recovery inputs; they are not automatically validated rollback targets for the new schema. Do not start them or restore the old production database merely to bypass a failure.

For disaster recovery, decrypt the protected backup only in an isolated environment. Restore database schema/data/roles/history, restore Vault values into a fresh Vault root, then restore object bytes at their original bucket/key mappings. Validate counts, identities and hashes before activating any external integrations. The completed object proof used an isolated proof bucket; remapping objects to the original production keys and activating restored Vault secrets remains an operator recovery step, not an action taken during this rollout. Apply the security migrations before admitting client traffic. Review data written after the snapshot before any production restore.

Older build 6 allows photos up to 10 MiB locally; the hardened server rejects photos above 4 MiB. Keep this rejection and recommend updating to the current candidate once distributed. Do not raise the server limit beyond provider capacity or weaken moderation. API request/response shapes for accepted files remain unchanged; exact old-binary native QA is still pending. Build 9 changes the client analytics gate; build 10 fixes Dynamic Type separator geometry. Neither requires another backend rollout.

## Separate approval

This deployment does not submit an Apple reply, App Review resubmission or public release. Those remain separate actions after the [final QA](APP_REVIEW_FINAL_QA_2026-10-09.pl.md) and metadata gates.
