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

## Follow-up — reply to a NiX (2026-10-11, ~10:10 UTC)

| Input | Value |
| --- | --- |
| Source | `e8c7655` (branch `fix/app-cleanup-stage1`) |
| Migration | `20261013100000_text_message_reply_to_nix.sql` (history now 67, local = remote) |
| Edge Functions / worker | unchanged (`new_nix` push payloads already carry the NiX id as `entityId`) |
| Encrypted backup SHA256 | `b01e617a2a75e445f3c6f94cf53c561c2b76aa4d36075b8fe26829eb5258b1dd` (`~/.nix-ops/reply-to-nix-2026-10-11/`) |

`text_messages.reply_to_nix_id` and `moderation_jobs.reply_to_nix_id` (FK to `nixes`, `ON DELETE SET NULL`); a trigger
keeps only a NiX the sender received from the receiver (otherwise NULL — the text is always delivered).
`enqueue_own_text_moderation_job` gained a trailing `p_reply_to_nix_id DEFAULT NULL` (DROP + CREATE, grants restored;
three-argument calls from shipped clients keep working), `materialize_approved_text_message` copies it and
`fetch_text_messages_with_peer` returns `reply_to_nix_id` and `reply_to_nix_media_type`. Reviewed against the last
deployed definitions: only the reply field was added.

## Follow-up — reply, edit, undo send (2026-10-11, ~13:50 UTC)

| Input | Value |
| --- | --- |
| Source | `f276b86` (branch `fix/app-cleanup-stage1`) |
| Migration | `20261014100000_text_message_reply_edit_unsend.sql` (history now 68, local = remote) |
| Edge Functions | `report-content` (evidence JSON adds `previousBodies` of an edited message), deployed with `--use-api` |
| Worker | unchanged (edit jobs are ordinary text jobs; `materialize_approved_text_message` routes them) |
| Encrypted backup SHA256 | `c6f21f30f7f1828d2984edcd1187892610be20da6f69aa32ca2b64782a87e4c9` (`~/.nix-ops/reply-edit-unsend-2026-10-11/`) |

- `text_messages.reply_to_message_id` (same-conversation quote, invalid → NULL, `ON DELETE SET NULL`), `edited_at`,
  `edit_count`; the direct-insert policy refuses client-set edit fields.
- `edit_own_text_message` (sender, text, 15 min, max 5 edits): with moderation ON it queues an edit job
  (`moderation_jobs.is_edit` / `edit_of_message_id`), a newer edit supersedes unclaimed ones; with moderation OFF it
  applies at once. Previous bodies go to `text_message_edits` (no client access, cascades with the message).
- `unsend_own_text_message` (sender, 5 min) deletes the message; existing DELETE triggers broadcast
  `messages_removed` and queue a voice object; a push not yet dispatched is skipped.
- `enqueue_own_text_moderation_job` gained `p_reply_to_message_id DEFAULT NULL` (DROP + CREATE, grants restored);
  `get_own_text_moderation_job` keeps the send-job behaviour of `20260912150000` and adds the edit case;
  `fetch_text_messages_with_peer` returns `edited_at` and the quoted message preview; `get_chat_capabilities`
  announces `message_replies` / `message_edits`.
- Smoke on production from the simulator account (QA texts to the owner's account only): swipe reply delivered with its
  quote after moderation, moderated edit applied with „Edytowano”, undo send removed the message.

## Follow-up — App Review preflight and privacy retention (2026-10-12)

| Input | Value |
| --- | --- |
| Source | `a9a8fbc` (branch `feat/privacy-policy-2026-10-12`, merged as `efda5a6`) |
| Migrations | `20261015100000_enforce_private_accounts`, `20261015101000_moderation_evidence_allow_audio`, `20261015102000_child_safety_report_reason`, `20261015103000_privacy_retention_fixes` (dry run listed exactly these four; all applied) |
| Edge Functions | `report-content` (voice evidence copy, `child_safety` priority), deployed with `--use-api` |
| Worker | unchanged |
| Encrypted backup SHA256 | `2e94180947e7161c309ba773e80d0c903b821238c241e7dff50f07c2f1aa3d11` (`~/.nix-ops/privacy-retention-2026-10-12/`) |

Before the push, the redefined functions were compared with the production dump:
- `prepare_nix_cleanup`: only the 30-day guard was added;
- `disable_push_device`: only the `signed_out` delete branch was added;
- `create_content_report_v2` and `get_public_profile_by_username`: checked in the 2026-10-11 preflight run.

Verified on production after the push:
- cron jobs `expire-unopened-nixes` (03:50) and `prune-technical-logs` (03:55);
- triggers `clear_thumbnail_on_cleanup`, `clear_thumbnail_on_release` and `expire_saved_texts_on_block`;
- `moderation-evidence` accepts audio;
- `content_reports_reason_check` includes `child_safety`;
- username search excludes private profiles;
- no cleaned NiX keeps a thumbnail (backfill: 0 left).

Behaviour that existing clients (builds 14/15) now see:
- private accounts no longer appear in username search;
- a direct friend request to a private account is rejected (QR codes and invites still work);
- reporting a voice message keeps the recording;
- signing out deletes the push device;
- unopened NiXes are cleaned up after 30 days;
- blocking unsaves the pair's messages.
