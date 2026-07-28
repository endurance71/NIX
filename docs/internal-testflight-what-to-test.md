# NiX 1.0.5 (5) — What to Test (Internal)

Audience: members of the App Store Connect group **NiX Internal QA** only.
This build must not be submitted for external Beta App Review.

Build: **1.0.5 (5)** · runtimeVersion **1.0.5** · channel **production**

## Focus for this build — photo upload speed

- Send a single photo on Wi‑Fi with the app in the foreground — expect roughly
  seconds, not minutes, end-to-end.
- Confirm Live Activity / Dynamic Island still updates and ends after success.
- Send a video and verify background resume after brief lock / network blip.
- Retry after a forced failure still recovers without long 60s stalls on photos.

## Durable media delivery (regression)

- Send a photo and a video to one recipient, then to several recipients.
- The send sheet closes after durable staging and opens Inbox; the camera session stops.
- Every recipient has a temporary Inbox row and a chat bubble with a consistent state.
- While sending, the chat bubble shows a circular loader; on failure it shows
  **„Błąd wysyłania · Spróbuj ponownie”** without raw backend errors or a percentage.
- Tap retry and verify the icon animates and the copy changes to sending. Long-press
  the bubble and verify retry/cancel actions and the shared-recipient warning.
- One media object is uploaded once and shared by all selected recipients.
- Lock the device, move between Wi-Fi/LTE/offline, restart the process and restart
  the phone. The queued job must remain visible and resume safely.
- Force quit may stop the transfer; opening NiX again must reconcile and resume it.
- Dynamic Island / Live Activity starts immediately, uses the NiX logo, opens
  `nix://inbox`, shows offline/failure/success states, and ends after success.
- On an iPhone without Dynamic Island, verify the Lock Screen Live Activity.

## Regression

- Camera: photo + video (front/rear), gallery pick, hold-drag zoom while recording.
- Status bar remains visible; camera privacy indicator disappears after leaving Camera.
- Unlimited / timed view durations; replay ×1 within 10 minutes.
- Save to Photos follows the recipient capture policy.
- Capture attempt push + chat chip when policy is deny.
- Light and dark appearance on a physical iPhone.

## Accounts / safety

- Email and Apple Sign-In session restore.
- Friend QR / username, report, block, unblock and account deletion.
- Push for a new NiX on a physical device.
- A non-recipient cannot read a shared asset.
- Cleanup of one recipient does not remove media still referenced by another recipient.

## Diagnostics

- Sentry must stay disabled (no envelopes / dSYM upload).
- Record failures, retries, duplicates and orphan assets during the 24-hour QA window.
- Block rollout on any P0/P1, lost job, duplicate NiX, unauthorized asset read or
  destructive shared-asset cleanup.
- After Processing in ASC, assign build **1.0.5 (5)** to **NiX Internal QA**.
