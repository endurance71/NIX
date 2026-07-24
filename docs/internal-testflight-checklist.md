# NiX — Internal TestFlight checklist

> **Ścieżka EAS.** Lokalny Xcode → TestFlight bez EAS:
> [`DEPLOY_IOS_TESTFLIGHT.md`](./DEPLOY_IOS_TESTFLIGHT.md).

Local validation snapshot: **15 July 2026**. Checked items below were executed
without changing the linked Supabase project, EAS credentials or App Store Connect.

## Release source

- [ ] Branch is `codex/internal-testflight`; all intended changes are committed.
- [ ] Remote branch SHA equals the SHA approved for the EAS workflow.
- [ ] Working tree is clean; no build is created from local uncommitted files.
- [ ] External workflow `testflight-submit.yml` has not been run.

## Automated gates

- [x] Typecheck, lint, 194 tests in 35 files and Knip pass.
- [x] Expo Doctor is 19/19 and `expo install --check` reports no mismatch.
- [x] React Doctor is 100/100 with zero warnings and zero changed issues.
- [x] Sentry hard-off, iOS config and Hermes production export pass.
- [x] Deno check/tests pass for every function currently in the worktree.
- [x] `supabase db reset` succeeds from the consolidated baseline.
- [x] Supabase DB lint reports zero schema/function findings after reset.
- [x] Active migrations contain no `TRUNCATE` or unbounded `DELETE`.
- [x] Local unsigned iOS Release succeeds and validates the final app bundle.

## Backend gate

- [ ] Encrypted schema/data backup and pre-deploy counts are stored outside the repo.
- [ ] Remote migration history is repaired only after local reset passes.
- [ ] Dry-run shows only the approved post-baseline migrations.
- [ ] The mandatory `20260715170000` RLS/RPC hardening migration is included.
- [ ] Decide whether concurrent push-notification changes belong to this release;
      do not repair or deploy migration `20260715160000` until that scope is approved.
- [ ] `MODERATOR_API_SECRET` and `MODERATION_CLEANUP_SECRET` are random 32+ byte secrets.
- [ ] `SENTRY_DSN` is absent.
- [ ] Both QA user UUIDs are in `private.safety_policy_cohort`; mode remains `cohort`.
- [ ] Control user outside the cohort remains compatible with the previous client.
- [x] Soft rollback preserves moderation evidence/tables and restores compatibility locally.
- [ ] Deployed Edge Functions and their rollback have both been exercised remotely.
- [ ] Pre/post counts match except for documented QA data.

## EAS and App Store Connect

- [ ] EAS `production` contains Supabase URL and anon key, but no Sentry DSN.
- [ ] `eas.json` contains the real numeric `ascAppId`.
- [ ] App record is NiX / `com.damianmotylinski.nixapp` / SKU `NIX-IOS-001`.
- [ ] Sign in with Apple and APNs credentials are configured.
- [ ] Group **NiX Internal QA** exists with automatic distribution disabled.
- [ ] Only App Store Connect team members are in the group.
- [ ] Paid build approval is granted only for the pushed, approved SHA.
- [ ] Build reaches Processing/Testing and is not submitted to Beta App Review.

## Two-device smoke

- [ ] Complete every scenario in `internal-testflight-what-to-test.md` on two iPhones.
- [ ] No P0 crash, auth/signing regression, data loss, UGC failure or Sentry transport.
- [ ] TestFlight feedback and backend logs are reviewed after 24h and 48h.

**GO Internal** requires every item above. External TestFlight remains NO-GO.
