# NiX 1.0.4 (1) — What to Test (Internal)

Audience: members of the App Store Connect group **NiX Internal QA** only.
This build must not be submitted for external Beta App Review.

Build: **1.0.4 (1)** · runtimeVersion **1.0.4** · channel **production**

## Focus for this build — Save to Photos

- **Sender preview:** after capturing a photo or video, use bottom-left save → Photos grants write access; toast confirms save; media appears in Photos.
- **Receiver viewer + deny (default):** no save button; screenshot/recording still blocked / reported as before.
- **Receiver viewer + allow:** in Profile → Friends enable **„Zrzut ekranu i zapis” / Screenshot and save** for the sender; open NiX → save button visible → save to Photos works.
- Toggle allow off again → save button gone; capture block returns.
- Deny Photos permission, then open Settings from the blocked alert and re-grant.

## Regression (keep light)

- Camera: photo + video (front/rear), gallery pick, hold-drag zoom while recording.
- Send-to sheet: select friends; **Wyślij wiadomość** has text only (no arrow icon).
- Unlimited / timed view durations; replay ×1 within 10 min.
- Capture attempt push + chat chip when policy is deny.
- Light and dark appearance on iPhone.

## Accounts / safety (spot-check)

- Email or Apple Sign-In session restore.
- Friend QR / username; block / report path if time allows.
- Push for new NiX (physical device only).

## Diagnostics

- Sentry must stay disabled (no envelopes / dSYM upload).
- Known: dSYM warnings for prebuilt Expo/React frameworks on upload — same as prior Path B builds.
- After Processing in ASC, assign build **1.0.4 (1)** to **NiX Internal QA**.
