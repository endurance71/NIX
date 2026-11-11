# NiX — reply to App Review (5.1.1(iv) permission requests), 2026-11-11

**DRAFT**, not sent. Send it on submission `8db797c3…` together with the build that contains the fix, then Update
Review and Resubmit. Status: [ios-current.md](ios-current.md).

---

Hello,

Thank you for the review and the clear description of the Guideline 5.1.1(iv) issues. We have changed every permission
request in the app:

- The custom messages shown before the camera, microphone and notification requests, including the notification
  message shown later in the app, now have a single button, "Continue", which always leads straight to the system
  permission request.
- The "Not Now" button on these messages has been removed, so the request can no longer be postponed from the message.
- After the user taps "Don't Allow" for the camera, microphone, photos or notifications, the app no longer sends
  them to the Settings app or shows a message pointing there. Only when the user later tries again to use a feature
  that needs that access does the app explain it, with an optional link to Settings, as suggested in your message.

The fix is included in build 1.0.13 (17), which we are submitting for review now. The demo account in App Review
Information is active and ready to use.

Thank you for your time.

Best regards,
Damian Motyliński
NiX
