# NiX 1.0.3 (3) — What to Test (Internal)

Audience: members of the App Store Connect group **NiX Internal QA** only.
This build must not be submitted for external Beta App Review.

Build: **1.0.3 (3)** · runtimeVersion **1.0.3** · channel **production**

## Accounts and onboarding

- Fresh email registration, email login, logout and session restoration.
- Sign in with Apple on a physical iPhone.
- Google Sign-In is not active in this build and is outside the test scope.
- Confirm the 16+ declaration is required and no date of birth is collected.
- Check an existing username, a new username and the under-threshold path.
- Set and edit a display name; confirm it appears in profile, inbox rows and friend lists.

QA credentials belong in the team password manager, never in this repository.
Use separate sender and receiver accounts from a controlled domain.

## Core message flow (NiX media)

- Add a friend by username and QR (header QR on Inbox / Profile); accept, reject and repeat after reopening the scanner.
- Send a photo and a video using front/rear camera, microphone and photo library.
- Verify compression, upload progress, realtime inbox delivery and sequential viewed ACK.
- Exercise refresh, offline/resume, Wi-Fi/cellular change and app relaunch.
- Deny camera, microphone, photos and notifications, then grant them in iOS Settings.
- Camera: lens switcher (if device supports), hold-drag zoom while recording, torch.

## Unlimited view duration (new in 1.0.3 / 3)

- In preview, select **∞ / Bez limitu** (or Unlimited) and send a photo — receiver viewer stays open until tap; no auto-advance.
- Send a video with Unlimited — video **loops** until tap dismiss; recording limits unchanged (max ~180 s).
- Timed durations (5–180 s) still auto-advance as before.

## Replay ×1 — 10 minutes (new in 1.0.3 / 3)

- Receive a NiX, open and close/finish once — chip shows replay affordance (“Dotknij, aby odtworzyć” / “Tap to replay”).
- Within 10 minutes, open again (replay) — after second finish, media is gone (cleaned).
- Wait >10 minutes without replay — NiX disappears after server sweeper (cron ~2 min); no second open.
- Two devices, same account: only one successful replay.

## Capture attempt notification (new in 1.0.3 / 3)

Requires capture policy **deny** (default) on the receiver for that sender.

- Open a received NiX and take a screenshot — sender gets Push (“próbował(a)… / tried to…”) and a **system chip** in the 1:1 chat (localized, not raw `capture_attempt`).
- Tap the push — opens the chat with the actor.
- App icon badge must **not** increase from capture_attempt alone.
- With capture **allow** for that friend: no report/push expected in this build.

## Ephemeral text chat + Tapback

- Open a 1:1 chat; send text messages both ways; confirm realtime delivery without refresh.
- Confirm messages disappear per TTL / footer copy (24h ephemeral behaviour).
- Long-press a bubble: Tapback picker opens with spring motion; pick an emoji; badge appears on the bubble edge.
- Remove a reaction (trash); confirm both sides update.
- Composer follows the keyboard smoothly; Liquid Glass send control has no opacity flicker.
- Appearance / accent: change accent colour and confirm chat chrome / headers update.

## Safety and account lifecycle

- Report a message, block its sender, verify the friendship/conversation is unavailable,
  then unblock.
- Run a QA moderation decision and verify its audit entry.
- Delete a disposable QA account and verify auth, application data, avatar and media removal.
- Confirm a control account outside the age cohort still works without an attestation;
  a QA cohort account must be blocked until it records the current 16+ attestation.

## Push notifications

Use two physical iPhones (or one device with two accounts across installs). Do not test push in Expo Go.

- Enable notifications in Profile; confirm iOS permission prompt / Settings recovery after deny.
- Send a new NiX: receiver gets a push in foreground, background and after cold start; tap opens inbox.
- Send a friend request and accept it: both events deliver a push with the expected copy.
- Send a text message: receiver gets a push; tap opens the chat.
- Add a Tapback reaction: the other party gets a reaction push with expected copy; tap opens the chat.
- Capture attempt push (see above).
- Confirm the Inbox tab badge shows the unread NiX count and clears after the message is viewed.
- Confirm the app icon badge matches the unread NiX count; it updates after viewing a NiX (or returning to the app) and clears on sign-out / disabling push. Friend request, accept, reaction, or capture_attempt must not inflate the icon badge beyond unread NiXes.

## Performance / ProMotion (optional on iPhone Pro)

- With JS debugger closed, scroll chat and inbox: UI should feel smooth (up to 120 Hz on ProMotion devices).
- Open/close Tapback reaction picker and press the camera shutter — motion should stay on the UI thread without hitching.
- Confirm `CADisableMinimumFrameDurationOnPhone` remains in the signed IPA Info.plist after any `prebuild`.

## Diagnostics

- Sentry must produce no breadcrumbs, envelopes, source-map upload or dSYM upload,
  even if a test DSN is present.
- Record crashes and screenshots through TestFlight feedback.
- Review TestFlight crash metrics, Supabase function logs (`push-dispatch`, `cleanup-nix-due`) and `upload_logs` after 24h
  and 48h.
