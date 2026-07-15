# NiX Internal TestFlight release runbook

This runbook intentionally separates local preparation from state-changing remote
operations. Do not cross a remote gate without a named approver and a recorded SHA.

## 1. Local preparation

1. Run all npm gates and `supabase db reset` on a fresh local stack.
2. Confirm the active migration list starts with
   `20260714104841_remote_baseline.sql` and contains only explicitly approved
   forward migrations.
   Migration `20260715160000_add_push_notifications.sql` was introduced by a
   concurrent workstream and requires an explicit include/exclude decision before
   commits, migration-history repair or deploy.
3. Confirm rollback SQL in `supabase/rollback/20260715_internal_safety_soft_rollback.sql`
   works against a local copy.
4. Commit logical changes, push the branch and record `git rev-parse HEAD`.

Current local evidence (15 July 2026): React Doctor 100/100, Expo Doctor 19/19,
194 tests, Knip, TypeScript, lint, Deno, Hermes export, fresh `supabase db reset`,
cohort compatibility assertions, soft rollback and unsigned iOS Release all pass.
These results do not authorize any remote operation.

## 2. Backup gate

Set `BACKUP_DIR` to an encrypted/off-repository destination and run
`scripts/backup-linked-supabase.sh`. Store the passphrase only in the team password
manager. Record counts for `auth.users`, profiles, friendships, nixes/messages and
Storage objects. Do not proceed if the archive cannot be decrypted in a test directory.

## 3. Migration-history repair gate

The destructive archived reset must never be applied. After the backup and local reset:

1. Mark the obsolete remote-only/local legacy versions as `reverted` with
   `supabase migration repair <version> --status reverted --linked`.
2. Ensure `20260714104841` remains `applied`; it represents the already-existing
   remote schema and must not execute against production.
3. Run `supabase db push --dry-run --linked`. The output must contain only approved
   post-baseline migrations. Stop on any unexpected migration or destructive DDL/DML.
4. Run `supabase db push --linked` only after a second approval.

## 4. Cohort and functions

1. Validate both QA UUIDs, then insert them into `private.safety_policy_cohort`
   using a service-role database session. Do not store emails or UUIDs in git.
2. Confirm `private.safety_policy_config.age_gate_mode = 'cohort'`.
3. Generate two independent random secrets of at least 32 bytes and set
   `MODERATOR_API_SECRET` and `MODERATION_CLEANUP_SECRET`. Do not set `SENTRY_DSN`.
4. Deploy `delete-account`, `report-content`, `block-user`, `moderation-admin` and
   `cleanup-moderation-evidence` with JWT verification enabled.
5. For admin calls use both `Authorization: Bearer <service-role key>` and the
   matching `x-moderator-secret` or `x-cleanup-secret` header.
6. Run cleanup manually for the internal window; Cron/Vault remains an external-beta P1.

Verify: an old-client control user outside the cohort can still send/use inbox,
while a QA cohort user cannot until recording the current age attestation.

## 5. Rollback

On data loss, auth/signing regression, core-flow crash, broken report/block or any
Sentry transport: remove the build from **NiX Internal QA** and stop invitations.
Redeploy the prior Edge Function versions, then apply the soft rollback SQL to
restore compatibility without dropping the new moderation tables. A full restore
from the encrypted backup is the last resort.

## 6. EAS and TestFlight

1. Set the EAS production Supabase variables and verify no Sentry DSN exists.
2. Enter the real App Store Connect app ID in `eas.json` and run
   `npm run check:internal-testflight-config`.
3. Create/verify the ASC record and the **NiX Internal QA** group with automatic
   distribution disabled.
4. Validate `.eas/workflows/internal-testflight.yml`, run it from the pushed SHA,
   and approve the paid build only after the workflow checks pass.
5. Confirm `submit_beta_review: false` and no external group membership.

Finish with the two-device smoke checklist. The status changes to **GO Internal**
only after a clean smoke and unchanged production counts outside documented QA data.
