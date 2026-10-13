# NiX iOS — current release status

> This document is the single source of truth for the current iOS release.
> Dated sprint plans and audit snapshots are historical evidence and must link
> here instead of presenting their old binary state as current.

## App Review candidate — 1.0.13 (15), 2026-10-11

Fixes from the [App Review preflight](APP_REVIEW_PREFLIGHT_2026-10-11.pl.md), step 1. **Runtime 1.0.13**, channel
production: OTAs for build 14 also apply here. `main` at `dcfee5c` (version bump `bb50249`).

Native changes:
- the share extension opens NiX only through `extensionContext.open`;
- a privacy manifest for every extension, and the app manifest gains 1C8F.1 and its collected data types;
- the `fetch` background mode is removed;
- the camera purpose string mentions QR codes;
- the widget description is PL/EN.

JS changes: the `child_safety` report reason and the welcome-tour copy.

Local Release Archive: `~/.nix-ops/release-1.0.13-15/` (ARCHIVE SUCCEEDED; 4 extension manifests present; only the
`processing` background mode). Uploaded with `xcodebuild -exportArchive` and the „NiX claude” API key. Build id
`e5fbc2b0-904f-434f-8b8b-1e9485d05f66`: VALID, in **NiX Internal QA** and **Team (Expo)**, with PL/EN What to Test.

Thirty-sixth OTA (2026-10-12): update group `deff6760-51f5-4201-b3d9-3c8f4791abcd`, source `97f1743`, for builds 14
and 15. The Memories empty-state description wraps instead of running off the screen. Build 14 also gets the JS from
build 15: the `child_safety` reason (it fails until the backend below is deployed) and the welcome-tour copy.

Thirty-seventh OTA (2026-10-12): update group `0cf50a8a-cc2a-487a-927c-240d528c0746`, source `5d13f59`, for builds 14
and 15. NiX is introduced as a ShipApp brand (the controller and provider stay MT Hub Damian Motyliński). The contact
moves to `nix@shipapp.pl` in the in-app documents, the consent copy and Profile → Contact. The web pages in
`web/invite/` are regenerated but not uploaded yet.

Thirty-eighth OTA (2026-10-12): update group `0ec10f1e-f37b-4683-a69d-04fd73ad3fb4`, source `2b22911`, for builds 14
and 15. The welcome tour and the login backdrop use the AI-generated photo set (light copies exported from
`assets/onboarding/source/`, 1.6 MB in total). The Memories scene shows nine different moments, and the capture scene
sends to three photo avatars.

Thirty-ninth OTA (2026-10-12): update group `936e7d84-7292-49f1-9366-49f0cfd557cd`, source `fba76bf`, for builds 14
and 15. Ola's chat avatar and her Memories tile in the welcome tour use a square face crop (`chat-face.jpg`) instead of
a centre crop of the portrait, which cut her head off.

Fortieth OTA (2026-10-12): update group `227772ac-0b18-4f0b-8d26-34a819915528`, source `ac0be33`, for builds 14 and 15.
The welcome tour now opens after every sign-in or sign-up, including signing out and back in. A session restored at
launch still skips it. The per-account "seen" marker is removed.

**Backend deployed (2026-10-12).** The three preflight migrations, plus `20261015103000_privacy_retention_fixes` and
`report-content`, are live. See the [deployment record](BACKEND_DEPLOYMENT_2026-10-11.md).

Forty-first OTA (2026-10-12): update group `04fe3a75-7910-4778-bc5c-f84270d4abac`, source `efda5a6`, for builds 14 and
15. It ships the privacy policy and terms 2026-10-12: a formal policy checked against the code, and a zero-tolerance
clause. `LEGAL_DOCUMENT_VERSION` is now 2026-10-12. The same documents are live on https://nix.shipapp.pl/privacy/.

Forty-second OTA (2026-10-13): update group `05abd5c1-4744-4ca8-a4fb-64acca0e2e79`, source `1a1105d`, for builds 14
and 15. Fixes found while recording for App Review: the birth date is a native SwiftUI date picker, asked once (an
e-mail sign-up carries the passed check to onboarding; Apple sign-ins still ask); Delete account puts the password
first and turns autofill off on the username confirmation, so iOS no longer fills in the e-mail; the consent checkbox
lines up with the links and its label.

Forty-third OTA (2026-10-13): update group `4cfc3ea3-9e04-414a-9623-c4d055d200bc`, source `f3ee4eb`, for builds 14
and 15. Verification codes use six digit boxes (sign-up and reset code screen, Change password). One invisible native
field keeps iOS code autofill from Mail and pasting; it takes six digits, submits when complete and clears after a
wrong code. The check-email description keeps the full stop after the e-mail.

Forty-fourth OTA (2026-10-13): update group `ceaf7cbe-0db5-4a77-a116-1897b6304363`, source `3f1d050`, for builds 14
and 15. Send to / To: show the friend's display name (the send capsule truncates); avatar initials come from the
display name everywhere; the cropper confirm says Choose / Wybierz. The welcome tour counts as seen only when closed,
so a new account gets it after its profile step. Delete account accepts the username or the account e-mail. The
email-template generator and nix.shipapp.pl/auth/confirm are merged into `main`.

Forty-fifth OTA (2026-10-13): update group `9cec757f-3193-449b-90f2-f8a07fdc52a0`, source `be36d6d`, for builds 14
and 15. An eye button shows / hides the password on sign-in, sign-up and reset (one button for both fields).

Forty-sixth OTA (2026-10-13): update group `7f0fe450-2479-4c62-abfc-e213d6928826`, source `ce0cd48`, for builds 14
and 15. A tap anywhere in an auth field row focuses the field; field hints sit under the card (no hairline inside).
A received NiX can be reported from the chat with a long press; once its file is gone the report goes to the sender
with the NiX id. The viewer treats missing media as permanent (Skip) and leaves NiXes past 30 days out of the queue.
The push prompt waits for the tabs, never over activation or the welcome tour.

## Feature candidate — 1.0.13 (14), 2026-10-11

Supersedes build 13 (never uploaded). Same **runtime 1.0.13** and channel production, so every OTA up to the
thirty-fifth applies. Merged into `main` (`83bd0ad`), version bump `6c5462d`. Adds in the binary: the brand assets
regenerated from the drawn logo (app icon light / dark / tinted, launch screen, widget logo); in JS: the welcome
tour shown right after a successful sign-in (once per account), the login stage, Memories zoom, chat polish.
Local Release Archive: `~/.nix-ops/release-1.0.13-14/` (ARCHIVE SUCCEEDED, 1.0.13 / 14). Uploaded 2026-10-11 with
`xcodebuild -exportArchive` and the App Store Connect team API key „NiX claude” (Admin; cloud-managed distribution
signing — an App Manager key fails with „Cloud signing permission error”). Build id
`0ff17740-330b-48df-8193-7fc34d92b71f`: VALID, `usesNonExemptEncryption=false`, **IN_BETA_TESTING** in **NiX
Internal QA** and **Team (Expo)**, PL/EN What to Test set through the API (`~/.nix-ops/release-1.0.13-14/asc.mjs`).
Keys live in `~/.appstoreconnect/private_keys/`, never in the repo.

## Feature candidate — 1.0.13 (13), 2026-10-11

Same branch and runtime as build 12 (**runtime 1.0.13**, channel production); build 13 adds native code that JS turns
on only when the binary announces it, so OTA bundles stay valid on build 12:
- `nix-media-overlay` constant `supportsCaptionBar` + `variant: "bar"` bake (Snapchat-style caption strip next to the
  text sticker);
- the `expo-camera` patch never records a photo or video upside down (JS also turns such stills upright on build 12);
- the PL/EN photo-library add purpose strings from the eighth OTA.
JS in the same source: reply (swipe or menu), edit, undo send and forward in the chat with the system context menu on
bubbles, pinned conversations as an avatar grid in the inbox. Backend: migration `20261014100000` and `report-content`
deployed first (see the [deployment record](BACKEND_DEPLOYMENT_2026-10-11.md)).
Local Release Archive: source `1e16611` (version bump `f6579d9`), `~/.nix-ops/release-1.0.13-13/`. Upload and
TestFlight assignment: pending — CLI export fails with „Failed to Use Accounts” and the EAS attempt stopped at the
Apple ID login needed to create the Share / Notification Service / Capture provisioning profiles (no build was
started). Needs the owner at the Mac (Organizer → Distribute, or `eas build` with an Apple login).
Tenth OTA (2026-10-11): update group `cbd89fae-2c4a-49a9-9e51-eea089004952`, source `87dd48a` — the JS above for
build 12 (caption bar stays hidden there: no native support).
Eleventh OTA (2026-10-11): update group `fcc22a09-67fc-4997-8bbb-ddd205aa8249`, source `507fa2a` — bubble tails and
Tapback badges no longer clipped by the native menu host, inbox avatars stay after a reorder, a pin's menu lifts only
that pin.
Twelfth OTA (2026-10-11): update group `76866662-384b-4ca9-8572-f558fa733148`, source `fd2de24` — double tap on a text bubble opens the
Tapback bar; the message menu lifts a bubble-only preview (no light frame).
Thirteenth OTA (2026-10-11): update group `77f2cf1c-e256-412d-855b-a7f02a776670`, source `cef9ae5` — the Tapback
bar folds back into the bubble when it closes.
Fourteenth OTA (2026-10-11): update group `66acc331-eb9a-4869-8022-025ff9998faf`, source `fec4975` — long press blurs the chat,
lifts the bubble and shows the large Tapback bar above the glass action menu (replaces the system context menu,
whose emoji palette size is fixed).
Fifteenth OTA (2026-10-11): update group `6b6cb58c-06b1-4832-88ab-3d94c7b25231`, source `dfc49d4` — the inbox search
field becomes the native search button next to Compose; closing it restores the pinned grid.
Sixteenth OTA (2026-10-11): update group `4de0479d-db24-46c8-997f-a9e8571e8732`, source `3ef611f` — Memories uses the
inline title like the other profile screens and its grid shares the 16 pt screen inset.
Seventeenth OTA (2026-10-11): update group `730173ed-1d47-4371-9b3b-8b59825bd307`, source `be50e89` — close
animations where only the open was animated (reply / edit banner, focus square, sticker trash, text sticker actions,
preview Save / Send) and the native zoom from a Memories cell into the viewer.
Eighteenth OTA (2026-10-11): update group `15071e7f-9e61-460b-a7b6-19de92cdf397`, source `cd783eb` — the Memories
viewer is pushed instead of presented, so the zoom transition actually runs (it still slid up as a modal).
Nineteenth OTA (2026-10-11): update group `714ce7a0-5808-4c1e-ac14-3ca2e9c54661`, source `238d5b0` — after
paging in the Memories viewer, closing zooms into the cell of the memory on screen (not the first one opened).
Twentieth OTA (2026-10-11): update group `06a32675-f71e-4847-9d36-8725d5801607`, source `e5aaf21` — motion-graphics
welcome tour (`/welcome`). Not shown on first launch yet; Profile → Testing (owner account / simulator only) opens it
or shows it on every launch.
Twenty-first OTA (2026-10-11): update group `8916ff6e-46bd-4151-b8d1-2cf289bb95a6`, source `1b79d87` — the welcome
tour opens and ends on the NiX logo drawing itself with the wordmark.
Twenty-second OTA (2026-10-11): update group `75aa601d-ede1-47cb-abe0-c50fd52d1de4`, source `a4f02df` — welcome
set-up steps (notifications, camera and microphone, public or private account, Memories) and a "getting your app
ready" finale with the logo.
Twenty-third OTA (2026-10-11): update group `7cd2bf8a-debb-407b-be52-dbc575123a26`, source `6fe3b49` — welcome set-up steps no longer advance on their own when a
permission is already granted; they show "Turned On" and wait for Continue.
Twenty-fourth OTA (2026-10-11): update group `1fc9ba14-dd0b-4277-81da-c63e5cc6ee74`, source `88eecf2` — welcome
set-up gains an accent colour step (live recolour).
Twenty-fifth OTA (2026-10-11): update group `8f1b5b33-a2d1-47a0-8f73-692fb1a86140`, source `7fa720c` — haptics
in step with the welcome motion (scene beats, logo strokes, page snaps, set-up, finale checklist).
Twenty-sixth OTA (2026-10-11): update group `ac2cffaa-af77-4ae3-bbe0-627148e506bb`, source `8a76626` — login on
the welcome stage (dark backdrop, accent glow, drawn logo, form rising in).
Twenty-seventh OTA (2026-10-11): update group `7e7966b6-347e-4d6c-84f5-1be714b888ec`, source `a58f529` — the
login stage follows the system light / dark appearance.
Twenty-eighth OTA (2026-10-11): update group `29718d4a-35d6-441d-bdd3-cd327422d6f5`, source `06766aa` — the
welcome tour follows the system light / dark appearance.
Twenty-ninth OTA (2026-10-11): update group `382fbacc-3efd-4f08-a1d4-398c1b296d21`, source `5d78e54` — the login form no longer jumps under the hero (safe area
read late), the Apple button keeps its size when busy, the logo starts drawing once the screen settles, and the
rising stroke no longer shows as a floating dot.
Thirtieth OTA (2026-10-11): update group `5bdd3cde-6942-49d5-94f7-7e09c7334f8b`, source `7816b86` — brand
masters follow the drawn logo (flat ink, glass rising stroke, no shadows); in-app assets refreshed. The app icon,
launch screen and widget logo changed too but ship only in a new binary (not in build 13's archive).
Thirty-first OTA (2026-10-11): update group `0a3ee0b1-e301-4bf7-82e1-7f6693af557c`, source `8b3571e` — the drawn
logo's glass stroke is glass from the first frame, no stray dots.
Thirty-second OTA (2026-10-11): update group `9acc9038-5337-4333-9972-7a07a179f560`, source `898c4ec` — the
login form holds still (host ignores safe areas; the stage lifts it above the keyboard) and the logo is drawn at
a steady pace.
Thirty-third OTA (2026-10-11): update group `649d5c96-948b-4c25-a88e-21fa185a2506`, source `622e740` — warmer
login tagline.
Thirty-fourth OTA (2026-10-11): update group `7eedf139-be50-4e86-bc2a-10e2240cc946`, source `55c4e7d` — the
login form no longer jumps on any tap (RN scroll view around a content-sized native card) and the logo's N is
drawn in one continuous move.
Thirty-fifth OTA (2026-10-11): update group `ab34273b-6aa9-44b6-bab7-0040bb431e80`, source `5c04f8a` — the
accent picked during welcome set-up eases in (tile, progress, glow crossfade, button tint).

## Feature candidate — 1.0.13 (12), 2026-10-11

Branch `fix/app-cleanup-stage1` (source `385379c`, includes the build-11 branch) adds new native targets (Share,
Notification Service and Lock Screen capture extensions, inbox widget, camera control) and modules, so it ships with
**version 1.0.13, build 12, runtime 1.0.13**. OTA for runtime 1.0.12 must never carry this JS. The matching backend is
**deployed** — see [deployment record](BACKEND_DEPLOYMENT_2026-10-11.md); it stays compatible with builds 10 and 11.
Local Release Archive **PASS** (app and four extensions 1.0.13 (12), runtime 1.0.13, channel production, Hermes bundle
with the production Supabase URL). **Uploaded** from Organizer on 2026-10-11 (source `b54f0ad`; upload symbols off-warning only: the archive has no dSYM
for `hermesvm.framework`). The first upload attempt was rejected because the Lock Screen camera extension was embedded
as a Foundation extension; it is now an ExtensionKit extension in `NiX.app/Extensions`. Xcode's distribution copy step
fails with Homebrew `rsync` 3.4.4 on `PATH` (`--extended-attributes: unknown option`); start Xcode with
`env PATH=/usr/bin:/bin:/usr/sbin:/sbin …/Xcode.app/Contents/MacOS/Xcode` for Organizer uploads. ASC build
`62a485e7-4b36-471b-82b4-fa1106fdc000` processed (**Ready to Submit**, expires in 90 days), assigned to **NiX Internal
QA** and **Team (Expo)** (4 internal testers each), bilingual PL/EN What to Test saved and verified after reload.
Device QA pending.

**OTA for runtime 1.0.13** (2026-10-11): update group `f8dd77b1-2a5b-4d08-8699-2d9a37ab0a7c`, channel `production`,
iOS only, source `7d2cdfe` — JS only since build 12 (`b54f0ad`): native Liquid Glass chrome (viewer reply bar, camera
pills, send-to search, chat composer buttons), voice messages with an explicit Send (tap to record, Stop, review, Send),
the chat scroll edge effect and delivered uploads shown as NiX chips. Builds 10/11 (runtime 1.0.12) do not receive it.
Second OTA (2026-10-11): update group `4b2509ef-fe14-4f0a-b39e-80101cc7401e`, source `4c43f63` — soft chat scroll edge via
`ScrollViewMarker`, camera close button back to the originating chat, live loudness spectrum while recording, every
in-app notification grows out of the Dynamic Island.
Third OTA (2026-10-11): update group `fd949aa5-db8a-4d07-aec3-1fd89a93ba84`, source `021f831` — the voice recording
spectrum glides at display rate on the UI thread.
Fourth OTA (2026-10-11): update group `c5609d52-c606-414a-9f7e-45018a26a72b`, source `e8c7655` — a reply to a NiX
(viewer field or notification action) shows a quoted header attached to its chat bubble. Needs migration
`20261013100000` (deployed first, see the backend record); without it the text is still delivered, without the header.
Fifth OTA (2026-10-11): update group `8c2c4a74-01a2-4dc2-bc88-9e10b8ceeb5a`, source `993e4f2` — a typed viewer reply
marks the NiX opened and the viewer moves on to the next NiX (or closes after the last).
Sixth OTA (2026-10-11): update group `fc702e2a-5a2f-47ec-9f7d-57023f4ff72c`, source `a4b4140` (published from a clean
worktree) — an uploaded NiX waiting for moderation reads Sent instead of „Sprawdzanie…"; Delivered follows on approval.
Seventh OTA (2026-10-11): update group `5d2701d5-a5c2-4caf-a347-de9c2f4e3777`, source `98c889b` — simulator QA fixes:
inbox search field visible again, new-chat sheet header, preview text on letterboxed media, centered Back on the media
error screen, inline titles on settings subpages, accent preview pill, friend-detail row icon, chat menu labels and
„NiX-a" spelling.
Eighth OTA (2026-10-11): update group `ca9bb39d-f01a-491f-bf6f-c66f24b7b824`, source `e57cb18` — swipeable Memories
gallery with pinch zoom, drag across the lens switcher, and the remaining QA fixes (startup remount hardening, send-to
keyboard, inbox rows at accessibility sizes, accent text contrast, WYSIWYG text position, viewer copy, reply header,
chat menu Pin + report confirmation, settings and legal copy). The PL/EN photo-library add purpose strings
(`InfoPlist.strings`) ship only with the next native build.
Ninth OTA (2026-10-11): update group `8671109b-334a-4629-b57a-8cb42d5bf6c4`, source `b8cc01c` — no scroll edge band
over the full-screen Memories gallery.

The 1.0.12 App Review track
(build 11) is unaffected.

## Next candidate in preparation — build 11, 2026-10-10

Branch `fix/pre-review-hardening` ([PR #56](https://github.com/endurance71/NIX/pull/56), CI green) carries the pre-review hardening: auth email links verified by `token_hash` instead of installing sessions from URLs, no navigation remount on connectivity changes, encrypted upload-queue capabilities, Apple sign-in consent text, localized auth errors, chat history paging and code cleanup. App and widget build numbers are **11**; runtime stays **1.0.12**. Build 11 is not archived or uploaded yet.

The matching backend is **deployed** (migrations `20261010120000`/`20261010121000`, five Edge Functions, worker `5953ec5-r2`); see [deployment record](BACKEND_DEPLOYMENT_2026-10-10.md). It stays compatible with build 10. Email templates, AASA `/auth/confirm*` and the fallback page must ship with build 11. Build 10 below remains the uploaded candidate until build 11 passes QA.

## Current public candidate — build 10, updated 2026-10-09

**New QA finding — password error localization:** the owner supplied a Polish build-10 recovery screenshot showing the raw English Auth response “New password should be different from the old password.” The reset/profile forms matched only “same password.” The client now maps structured `same_password` first, supports both known legacy phrasings and uses a localized fallback for unknown password-update errors. PL/EN regression tests pass; updated checks: 101 files / 597 app tests, TypeScript, lint, Knip and React Doctor 551 files / 0 errors / 0 warnings without baseline. This source fix is **not included in the uploaded build 10**. A new native candidate and final QA are required before App Review; no OTA was published. Build-10 evidence below remains specific to its original source.

**1.0.12 (10)**, client source `9b1d344efecb0dcd122badc45c5ce9663a2bfcad`, replaces build 9 after large-text QA found two auth layout issues. The “lub/or” separator reserves scaled label space and preserves natural text width; primary actions use minimum height and padding so scaled or multiline labels can grow. Default-size layout, analytics hard-off, runtime **1.0.12**, production channel and deployed backend are preserved. App/widget build numbers are synchronized at 10.

Local TypeScript/lint/Knip, **582 app tests**, 14 release-environment tests, React Doctor **549 files / 0 errors / 0 warnings** without a baseline, Expo Doctor **20/20**, iOS synchronization, production preflight, reviewed dependency audit and Hermes export **PASS**. [GitHub CI](https://github.com/endurance71/NIX/actions/runs/37900321634) (migrations/AuthStorage A+B/runtime/Swift) and EAS quality gates (`01a11f9a-ba1b-7820-8006-9475a9caf87c`) also **PASS** on `9b1d344`.

Earlier signed simulator 10 (`1be78ee`) passed the PL divider regression at Text Size 7 / Dark on iPad, default light login and opening privacy version 2026-10-08. A clean iPhone 16e simulator reached default login, but Text Size 7 clipped the primary label. The final signed Release simulator (`9b1d344`) passed the Text Size 7 regression on iPhone 16e: the full primary label and Apple action are visible, and the separator stays on one line. The default-size Light login and Dark empty-email validation also passed after relaunch. The final local Xcode Release Archive **PASS**. Archive app/widget version 1.0.12 (10), production backend and Expo runtime/channel checks **PASS**. After owner login, Organizer signed and uploaded **1.0.12 (10)** with `testFlightInternalTestingOnly=false` and version management disabled. The exact signed upload package is retained locally. IPA SHA256 `ae95660ba5de534fbc532c4e84f22e462aad27228e87518a0ab26c0c14d17ec1`; embedded Hermes SHA256 `b2b96c3943f21f887e595637f88891658c7bf0b527b2f9b1cf5b55a8483c32e0`. Strict app/widget signatures, App Store profiles, production APNs/backend and Expo runtime/channel **PASS**. ASC build `34a9f9d5-1872-48d0-a5e1-ccf203245e00` is **Validated / Ready to Submit**. It is assigned to **NiX Internal QA** and **Team (Expo)** (4 internal testers each); bilingual PL/EN What to Test is saved in the sole available English(U.S.) Test Details field. Build 6 was removed, build **10 selected and saved for version 1.0.12**, and persistence verified after reload. Manual release remains selected. [Open build 10](https://appstoreconnect.apple.com/teams/f808d5d8-f16c-48e0-8330-04dda650a25d/apps/6791332379/testflight/ios/34a9f9d5-1872-48d0-a5e1-ccf203245e00).

Owner smoke on the installed TestFlight **10**: email/Apple login and sending/receiving text, photos and short video **PASS** (owner answer 2026-10-09). This is partial physical-device QA, without a recording or proof for the rest of the matrix. Reviewer API check: peer credentials from private Notes authenticate; the main ASC login is a username, and trying the first Notes email with the main field password returned HTTP400 `invalid_credentials` (also after the owner reported correction). Owner correction/verification of the exact main email is needed; both-account relationship verification remains pending. No credentials are saved in reports. The earlier divider-only archive was interrupted before distribution; the final build 10 is uploaded and selected in ASC. Remaining authenticated/device/accessibility/keyboard/gesture QA is pending.

Build 9 upload completed in Organizer; it is superseded and must not be used for final recording or App Review selection. The unsigned iPad simulator’s initial SecureStore error disappeared once Xcode supplied simulated entitlements, without changing auth code. These are limited simulator observations, not complete TestFlight or physical-device QA.

**Not READY FOR APP REVIEW:** remaining TestFlight device QA, main reviewer login/relationship, owner recording, six complete answers, current screenshots and regional/DSA/privacy checks remain pending. Owner login in Xcode/ASC is restored. No Apple reply, resubmission, OTA or public release has been performed.

See [preparation report](APP_REVIEW_PREPARATION_2026-10-08.pl.md), [deployment and recovery](BACKEND_DEPLOYMENT_2026-10-09.md), and [final QA scenario](APP_REVIEW_FINAL_QA_2026-10-09.pl.md).

## Superseded public candidate 9 — uploaded 2026-10-09

**1.0.12 (9)** replaces build 8. Client source `859694ad3dab5b2287887ab88019a310952f89e9` hard-disables analytics regardless of local dotenv or internal roadmap flags. The Release preflight now rejects enabled analytics/Sentry flags, with regression tests for dotenv precedence and existing consent. Runtime **1.0.12**, channel **production**, backend and native feature scope remain unchanged. All local checks and [CI](https://github.com/endurance71/NIX/actions/runs/37889189207) pass, including 580 app tests, 14 release-environment tests, React Doctor 0/0 and Expo Doctor 20/20.

Local Xcode Release Archive **PASS**. Organizer signed a public App Store distribution IPA using the existing cloud certificate. The exact uploaded signed package was retained directly from Xcode's distribution pipeline after the Save panel did not complete; CLI export reports `No Accounts`. IPA SHA256 `c18349581af8a904eb2af930cae2889e0938193635ebd2ed2bccbd6f2d0fc95b`; embedded Hermes SHA256 `a4013c33373334437b69fca5943f68185b94185c1d20c8672287c3f00d367075`. App/widget build 9, production APNs/backend, runtime/channel, distribution profile and strict deep signature verification **PASS**. Organizer reports **App upload complete: NiX 1.0.12 (9) uploaded**, with internal-only and build-number management disabled. The uploaded IPA has the hash above; re-signing changed the IPA hash but preserved the exact Hermes bundle. ASC processing, internal assignment and build selection remain pending. Release build 9 also compiled, installed and launched on an isolated iPad simulator; visual and functional compatibility QA remains pending.

Build 8 passed signing/upload and API smoke but is **superseded**, because the final environment inspection found `.env.local` enabling analytics over `.env.production=false`. Its beta availability is not evidence that it satisfies the no-analytics requirement. Do not use it for the final owner recording or approve it for App Review. Final QA must use build 9, with new IPA/bundle hashes and a fresh OTA snapshot.

**Not READY FOR APP REVIEW:** final TestFlight device QA, both reviewer logins, owner recording, six complete answers, screenshot/build selection and regional/DSA/privacy checks remain pending. The ASC session expired and requires the owner to log in again. DSA needs the owner's declaration; ICP applicability/documentation needs confirmation without reducing regions. No Apple reply, resubmission, OTA or public release has been performed.

See [preparation report](APP_REVIEW_PREPARATION_2026-10-08.pl.md), [deployment and recovery](BACKEND_DEPLOYMENT_2026-10-09.md), and [final QA scenario](APP_REVIEW_FINAL_QA_2026-10-09.pl.md).

## Superseded public build 8 — verified 2026-10-08


Candidate **1.0.12 (8)**, runtime **1.0.12**, production channel, has passed local Xcode Release Archive/export/upload and ASC processing. `testFlightInternalTestingOnly=false`; it is assigned to **NiX Internal QA** and **Team (Expo)**. ASC build ID `fc5ea753-5d50-41ab-8524-3818fb4695b6`, binary state Validated, beta state Ready to Submit. Client source `1300dc1283eb55434cdfcf3d0100f4ad11141bf3`; IPA SHA256 `29ff374d5898aa6c9f7ed741b0accf0259533ddc0d64e6fcf0e2405231259ce0`. [Open build 8](https://appstoreconnect.apple.com/teams/f808d5d8-f16c-48e0-8330-04dda650a25d/apps/6791332379/testflight/ios/fc5ea753-5d50-41ab-8524-3818fb4695b6).

Backend source `bbd143643a85665c378d2a197a4020b1f5843642` is deployed after encrypted backup, isolated database restore, real Auth/Storage staging and a rollout-order rehearsal preserving pending jobs. Both forward migrations and 16 Edge Functions are deployed; the exact tested worker image is running on OVH. Dedicated-account production smoke PASS; original reviewer accounts were not deleted. CI including real Auth/Storage paths A/B and EAS quality gates PASS. Native device QA is pending.

Public legal/support PL/EN pages, AASA and invite routes have been restored and verified. Mac and Vision Pro distribution are disabled; 175 regions preserved. Version field **1.0.12**, bilingual descriptions and support URLs saved; manual release retained. The former build 6 association was removed. Build 8 was not yet present in the App Review picker, and the ASC session expired; selecting it remains pending. No reply or resubmission was performed.

**Not READY FOR APP REVIEW:** final device QA, both reviewer logins, owner recording, six complete answers, screenshot/build selection and regional/DSA/privacy checks remain pending. DSA needs the owner's declaration; ICP applicability/documentation needs confirmation without reducing regions. No OTA exists for runtime 1.0.12 at the recorded snapshot; do not publish one before final QA and a new scope review. See [preparation report](APP_REVIEW_PREPARATION_2026-10-08.pl.md) and [final QA scenario](APP_REVIEW_FINAL_QA_2026-10-09.pl.md).

## Historical Internal-only build 7 — 2026-10-08

The prior Internal TestFlight build was **1.0.12 (7)**, runtime **1.0.12**, on `codex/nix-stabilization`. It includes native uploader changes, private photo downloads and updated native dependencies, so it requires a new binary. Source commit [`27595e2`](https://github.com/endurance71/NIX/commit/27595e28a5913631acf6a01ebb3db261c30bc3a9) is committed and pushed. A local **Release Archive succeeded** on 2026-10-08. The owner selected **Internal TestFlight / NiX Internal QA** as the deployment target; production backend deployment is outside this operation.

**Internal distribution verified:** the owner accepted the updated Apple Developer Program License Agreement. Local distribution export and upload succeeded on 2026-10-08; App Store Connect completed processing and shows **1.0.12 (7)** as **Testing / Internal**, expiring in 90 days. Build ID: `dad6024c-765c-4504-a6b9-b957cf206061`. The candidate is assigned to **NiX Internal QA** (four internal testers); the existing **Team (Expo)** group also received it through automatic distribution. Bilingual PL/EN “What to Test” notes were saved. [Open the build in TestFlight](https://appstoreconnect.apple.com/teams/f808d5d8-f16c-48e0-8330-04dda650a25d/apps/6791332379/testflight/ios/dad6024c-765c-4504-a6b9-b957cf206061).

IPA checks confirmed version/build/runtime, production Expo channel, production APNs and distribution provisioning (`get-task-allow=false`). Export options restrict the candidate to **Internal TestFlight only** and preserve build number 7. The app source remains commit `27595e2`; subsequent commits only record release evidence. No public submission or production backend deployment was performed for this candidate. Local archive, IPA, signing/upload logs, screenshots and release receipt are in `~/.nix-ops/release-2026-10-08/`. Full native QA remains tracked in the implementation reports below; owner camera photo/video/preview smoke passed on the development build.

Validation and rollout conditions: [implementation report](../IMPLEMENTATION_2026-10-08.pl.md), [React Doctor zero report](../REACT_DOCTOR_ZERO_2026-10-08.pl.md).

## Current public App Review status — verified 2026-10-08

Public submission **1.0.11 (6)**, `8db797c3-1620-4294-8af2-8d3e688ba4f3`, is **Rejected / Unresolved Issues**. Apple’s sole visible message, dated 2026-09-13, requests additional information under **2.1 — Information Needed — New App Submission**: a physical-device recording and answers about purpose, access, external services, regions and regulated/protected material. No developer reply is visible. The newer Internal-only build **1.0.12 (7)** does not replace this submission and cannot be submitted for public App Review.

The initial 2026-10-08 audit found **HTTP 404** at the configured public privacy and support URLs and the documented terms URL; Mac and Vision Pro distribution are enabled despite iPhone-only Review Notes. These were additional audit findings, not reasons stated in Apple's September message. The website/platform findings have since been fixed, metadata updated and backend deployed as described above. No Apple response or public resubmission was performed. See the [detailed feedback analysis](../APP_REVIEW_FEEDBACK_ANALYSIS_2026-10-08.pl.md) and [unsent reply draft](apple-review-response-draft-2026-10-08.en.md).

The production/ASC entries below are historical observations from **2026-09-12**. Their Waiting for Review state is superseded by the verified rejection above. Installed OTA, live backend behavior and moderation budget still require verification before a production rollout. No release action was taken during stabilization.

## Last recorded distributed binary (2026-09-12)

| Field | Value |
| --- | --- |
| App Store Connect app | NiX (`6791332379`) |
| Version | `1.0.11` |
| Last recorded build | `6` (Internal TestFlight; owner device PASS 2026-09-12) |
| Source SHA | `063530f49418b6fc7e99ed857e8556306d03e867` |
| Source branch at upload | `feat/ios-1.0.11-build-6` |
| Previous Internal TF evidence | build `5` on `c2175ce8902161bceefd86668e98955e1487b12c` |
| Distribution | Internal TestFlight + public App Review |
| Last recorded Public App Review | **WAITING FOR REVIEW** (2026-09-12; current state unverified) |
| Submission | `8db797c3-1620-4294-8af2-8d3e688ba4f3` — iOS App `1.0.11 (6)` |
| Release type | Manual (`Manually release this version`) |

Build `1.0.11 (6)` was uploaded to App Store Connect on 2026-09-12 via local
Xcode Archive (not EAS). Owner recorded Internal TestFlight device **PASS**
the same day (`pass wszystko`: navigation, lists, camera, media upload,
background upload). Owner GO Submit the same day. ASC accepted the version;
status is **Waiting for Review**. Build 5 remains prior Internal TestFlight
evidence. Evidence: `~/.nix-ops/p0-3-s6/ASC-SUBMIT-20260912.md`.

## Historical verified gates — builds 5 and 6

On the exact build 5 source SHA (`c2175ce`):

- TypeScript: PASS;
- ESLint: PASS;
- Vitest: 77 files / 430 tests PASS;
- Knip: PASS;
- iOS config synchronization: PASS;
- Internal TestFlight config: PASS;
- production release environment validation and its tests: PASS;
- Xcode Archive, export, signing and App Store upload: PASS, recorded outside
  Git in `~/.nix-ops/sprint5-paste-input/INTERNAL-TESTFLIGHT-5.md`.

On the exact build 6 archive SHA (`063530f`):

- iOS config synchronization: PASS;
- Sentry default-off: PASS;
- production release environment validation: PASS;
- Vitest: 78 files / 440 tests PASS;
- Xcode Archive, export, signing and App Store Connect upload: PASS, recorded
  outside Git in `~/.nix-ops/p0-3-s6/DECISION4-IOS-BUILD6-ARCHIVE-20260912.md`.
- Owner Internal TestFlight device PASS: 2026-09-12 (`pass wszystko`;
  navigation, lists, camera, media upload, background upload). Evidence:
  `DECISION4-IOS-BUILD6-DEVICE-PASS-20260912.md`. Flag OFF; not the full C8
  App Review matrix.
- TypeScript `tsc --noEmit` still fails on pre-existing auth route types and
  `productAnalyticsService.test.ts` (unchanged by the build-number bump).

## P0-3 / moderation progress (2026-09-03)

| Gate | Status |
| --- | --- |
| C2 Azure F0 spike | **Accepted** 2026-09-12 — ADR-001 **Accepted**. Strategy `uniform_scene_guard` (not full video scan). F0 Monitor/MCP exact **3523** at Accept; S0 portal exception ACTIVE. Evidence: `~/.nix-ops/p0-3-spike-s0/decision.md` + `~/.nix-ops/p0-3-s6/S0-EXCEPTION-ACTIVATED-20260912.md`. Prod flag **ON** 2026-09-12 (`wlacz flage`). |
| C3A OVH offline video runtime | **PASS** (offline benchmark; no Azure; no prod entry) |
| C3B offline integration | **PASS (base)** — merged via [PR #18](https://github.com/endurance71/NIX/pull/18). Fake Azure; flag OFF. |
| C3B audit fixes | **MERGED** — merge SHA [`5d3cd41`](https://github.com/endurance71/NIX/commit/5d3cd410079ce1488c9c80f7248786604595da81) ([PR #24](https://github.com/endurance71/NIX/pull/24), tip `59d6721`). Complete/lease REVOKE, attempt-id budget, Auth/Storage Path A+B PASS, local verify PASS. Expo CI **exception** (quota; reset 2026-10-01 UTC). Evidence: `~/.nix-ops/p0-3-c3b-audit-fixes/`. Flag OFF; **no** prod `db push` / App Review. Status: [`../plans/2026-09-04-c3b-auth-storage-merged.md`](../plans/2026-09-04-c3b-auth-storage-merged.md). |
| §6 Decision 3 fake-only staging | **PASS** 2026-09-12 — owner `zatwierdzam GO staging canary`. Deno 2.9.6 worker suite **41 passed / 0 failed** on SHA `d146bba`; ffmpeg/ffprobe 8.1.2; **0** Azure Analyze. Rollback drilled. Evidence: `~/.nix-ops/p0-3-s6/DECISION3-STAGING-FAKE-SOAK-PASS-20260912.md`. |
| §6 Decision 3 live Azure canary | **PASS** 2026-09-12 — owner `ruszaj`. Cap **50**; used **6** (5 safe text + 1 safe JPEG, all `approved` severity 0); video live **off**. SHA `3482e65`, clean tree. `external_used` **3630 / 4000** (remaining **370**). Evidence: `~/.nix-ops/p0-3-s6/DECISION3-LIVE-AZURE-CANARY-PASS-20260912.md`. |
| §6 Decision 4 | **GO recorded** 2026-09-12 (`zgoda`). C3 schema **on prod**. Storage download + OVH idle worker. `enqueue_own` + `get_own` on prod. Archive **1.0.11 (6)**; owner Internal TF device **PASS** 2026-09-12 (`pass wszystko`; issue [#15](https://github.com/endurance71/NIX/issues/15) closed). Owner `wlacz flage` 2026-09-12: Privacy Policy Azure wording, OTA `874edb39` (`8688bfb`, runtime `1.0.11`), then flag **TRUE**. INSERT fallback blocked. **Not** READY FOR REVIEW. Evidence: `~/.nix-ops/p0-3-s6/DECISION4-GO-20260912.md` + `DECISION4-PROD-SCHEMA-FLAG-OFF-20260912.md` + `DECISION4-STORAGE-DOWNLOAD-SMOKE-20260912.md` + `DECISION4-OVH-HOST-IDLE-20260912.md` + `DECISION4-IOS-ENQUEUE-FALLBACK-20260912.md` + `DECISION4-IOS-BUILD6-ARCHIVE-20260912.md` + `DECISION4-IOS-BUILD6-DEVICE-SMOKE-20260912.md` + `DECISION4-IOS-BUILD6-DEVICE-PASS-20260912.md` + `DECISION4-FLAG-ON-20260912.md`. |
| Production pre-delivery filter | **ON** 2026-09-12 — flag TRUE after OTA. Hotfix [PR #48](https://github.com/endurance71/NIX/pull/48) (`e1d73cf`) delivers approved text and finalizes photos. HTTPS privacy/terms **2026-09-12** live. Photo wait loop [PR #50](https://github.com/endurance71/NIX/pull/50) (`ae943fb`) + OTA `4f1fcd22`. Owner allowed **text + photo + video** delivered 2026-09-12. Public App Review **WAITING FOR REVIEW** 2026-09-12 (owner Submit GO). |

Flag `pre_delivery_moderation_enabled` is **TRUE** on production after owner `wlacz flage` (2026-09-12). HTTPS privacy/terms **2026-09-12** (Azure wording) are live at `https://nix.damianmotylinski.pl/privacy/` and `/terms/` (PL + EN). Public App Review is **WAITING FOR REVIEW** (submitted 2026-09-12; build **6**; manual release). Build **6** + OTA `4f1fcd22` (runtime `1.0.11`; prior send-PASS OTA was `874edb39`). OVH worker image `nix-moderation-worker:e1d73cf` (try/catch from PR #48). Rollback is `UPDATE … = false`, not a migration. See [`../plans/2026-09-04-c3b-next-gate-staging-canary.md`](../plans/2026-09-04-c3b-next-gate-staging-canary.md).

## Historical release blockers — recorded 2026-09-12

1. **P0-3 — pre-delivery filter:** Flag **TRUE**. Text/photo/video enqueue is
   fail-closed pending Azure. Hotfix [PR #48](https://github.com/endurance71/NIX/pull/48)
   and photo wait [PR #50](https://github.com/endurance71/NIX/pull/50) are on prod.
   HTTPS privacy/terms **2026-09-12** published (PL + EN). Owner live send on
   OTA `4f1fcd22`: allowed **text, photo, and video all delivered** 2026-09-12.
   F0 ledger **3649 / 4000** (`external_used` 3630 + `consumed_txn` 19).
   Public App Review **WAITING FOR REVIEW** 2026-09-12.
2. **Physical-device QA (iPhone):** owner Internal TF **PASS** on `1.0.11 (6)`
   plus remaining 1.2 (reject / report / block / paste / offline / permissions)
   attested 2026-09-12. Allowed text/photo/video delivery confirmed the same
   day. Current JS is OTA `4f1fcd22`. Runbook:
   `~/.nix-ops/c8-device-2026-09-12.md`. Matrix:
   [`../testing/app-review-device-smoke.md`](../testing/app-review-device-smoke.md).
3. **iPad / IPv6:** owner excluded from this C8 slice (`tylko iPhone`). App is
   `supportsTablet: false`. Residual Apple Review risk (iPad compatibility mode
   and IPv6 NAT64) stays documented; not a C8 execute item.
4. **Push JWT:** production `push-dispatch` **v15** `verify_jwt=true` (owner GO
   2026-09-12). Vault cron path HTTP 200; unauthenticated POST 401. Issue
   [#7](https://github.com/endurance71/NIX/issues/7) closed completed.
5. **Release tag:** create a signed tag
   `testflight/ios-1.0.11-build.5` on `c2175ce` after the repository signing key
   is unlocked.
6. **Native dependency security:** React Native `0.86.3` + patch is in binary
   `1.0.11 (6)`. Owner device PASS 2026-09-12 closed GitHub issue #15. Do not
   apply `npm audit fix --force`.
7. **Reproducible Deno gate:** Node `24.18` / Deno `2.9.6` pins + frozen
   `deno.lock` are on `main` via PR #19. Close GitHub issue #16 after confirming
   CI/toolchain on a green Lint/test run.

## Next eligible App Review candidate

Build **1.0.11 (6)** remains attached to the rejected public submission. The
information request alone does not require a replacement binary: it can be
answered for that candidate after confirming its actual behavior, supplying
the requested recording and repairing the public URLs.

To ship the current stabilization changes, prepare a new public-eligible
binary, for example **1.0.12 (8)** after checking build-number availability.
Internal-only **1.0.12 (7)** cannot be used for this purpose. The recording,
review Notes, tested backend and selected binary must match. Resolve platform
scope and the six requested information items before resubmission. No candidate
was submitted during this analysis; publication remains a separate operation
and release after approval remains **manual**.

Illustrative public status progression (current state is **Rejected**):

```text
NO-GO / INTERNAL TESTFLIGHT
  -> READY FOR REVIEW
  -> WAITING FOR REVIEW
  -> IN REVIEW
  -> APPROVED or REJECTED / UNRESOLVED ISSUES
```

Uploading a binary or attaching it to TestFlight never advances the public App
Review status by itself.

## GO path progress (2026-09-11)

Workspace synced to `origin/main`. Local dirty C1–C8 tree was snapshotted on
`wip/local-pre-sync-20260911` (do not merge) and discarded from `main`.

| Item | Result |
| --- | --- |
| PR [#9](https://github.com/endurance71/NIX/pull/9) spike | Closed obsolete — already on `main` via later C3B PRs |
| Issue [#29](https://github.com/endurance71/NIX/issues/29) JWT | Closed not_planned — local Supabase **demo** keys (`iss=supabase-demo`), not prod |
| PR [#32](https://github.com/endurance71/NIX/pull/32) S0 binding | Merged `6d8bcc9` — does **not** activate S0 exception or Accept ADR |
| PR [#31](https://github.com/endurance71/NIX/pull/31) privacy / Sentry | Merged `9f52de8` after rebase onto `main` |
| ADR-001 | **Accepted** 2026-09-12 (owner GO S0 exception + `zatwierdzam Accepted`) |
| C2 `--require-complete-s0` | PASS after ACTIVE + Accepted `decision.md` |
| §6 Decision 3 fake-only | **PASS** 2026-09-12 (`zatwierdzam GO staging canary`; 41 tests; 0 Analyze) |
| §6 Decision 3 live Azure canary | **PASS** 2026-09-12 (`ruszaj`; 6/50 txn; video off; `external_used` **3630**) |
| §6 Decision 4 | **Flag TRUE** 2026-09-12 (`wlacz flage`); OTA `874edb39` then `4f1fcd22`; INSERT blocked; later same day App Review **WAITING FOR REVIEW** |
| Production flag | **ON** — hotfix [PR #48](https://github.com/endurance71/NIX/pull/48) `e1d73cf`; owner **allowed** send PASS after flag ON |
| Photo wait OTA | [PR #50](https://github.com/endurance71/NIX/pull/50) `ae943fb`; group `4f1fcd22`; RPC `get_own_media_moderation_job` |
| OVH worker | image `nix-moderation-worker:e1d73cf`; try/catch live; RestartCount 0 |
| HTTPS privacy/terms | **2026-09-12** live (`/privacy`, `/terms`, `/privacy/en`, `/terms/en`) |
| `push-dispatch` | prod **v15** `verify_jwt=true` — Vault cron HTTP 200; issue #7 closed |
| C8 iPhone + SIWA | owner PASS 2026-09-12 (attestation; no PII in Git) |
| Allowed text / photo / video | **PASS** 2026-09-12 — owner `wszystko doszlo`; jobs 4 text + 2 image + 1 video approved |
| iPad / IPv6 | deferred by owner (`tylko iPhone`); `supportsTablet: false` |
| F0 | **3649 / 4000** remaining **351** |
| Public App Review | **WAITING FOR REVIEW** 2026-09-12 — submission `8db797c3-1620-4294-8af2-8d3e688ba4f3`, build **6**, manual release |

Production flag is TRUE. Binary **6** + OTA `4f1fcd22` + SQL `20260912150000` +
`20260912160000`. `push-dispatch` v15. HTTPS privacy matches in-app 2026-09-12.
Public App Review submitted 2026-09-12.
