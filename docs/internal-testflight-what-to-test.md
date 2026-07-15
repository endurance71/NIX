# NiX 1.0.0 — What to Test (Internal)

Audience: members of the App Store Connect group **NiX Internal QA** only.
This build must not be submitted for external Beta App Review.

## Accounts and onboarding

- Fresh email registration, email login, logout and session restoration.
- Sign in with Apple on a physical iPhone.
- Google Sign-In is not active in this build and is outside the test scope.
- Confirm the 16+ declaration is required and no date of birth is collected.
- Check an existing username, a new username and the under-threshold path.

QA credentials belong in the team password manager, never in this repository.
Use separate sender and receiver accounts from a controlled domain.

## Core message flow

- Add a friend by username and QR; accept, reject and repeat after reopening the scanner.
- Send a photo and a video using front/rear camera, microphone and photo library.
- Verify compression, upload progress, realtime inbox delivery and sequential viewed ACK.
- Exercise refresh, offline/resume, Wi-Fi/cellular change and app relaunch.
- Deny camera, microphone, photos and notifications, then grant them in iOS Settings.

## Safety and account lifecycle

- Report a message, block its sender, verify the friendship/conversation is unavailable,
  then unblock.
- Run a QA moderation decision and verify its audit entry.
- Delete a disposable QA account and verify auth, application data, avatar and media removal.
- Confirm a control account outside the age cohort still works without an attestation;
  a QA cohort account must be blocked until it records the current 16+ attestation.

## Diagnostics

- Sentry must produce no breadcrumbs, envelopes, source-map upload or dSYM upload,
  even if a test DSN is present.
- Record crashes and screenshots through TestFlight feedback.
- Review TestFlight crash metrics, Supabase function logs and `upload_logs` after 24h
  and 48h.
