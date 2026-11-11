# NiX — reply to App Review (5.1.1(iv) permission requests), 2026-11-11

**SENT** on submission `8db797c3…` on 2026-11-11 at 11:49 (CET), before Update Review and Resubmit with build 17.
Status: [ios-current.md](ios-current.md).

---

Hello,

Thank you for the detailed feedback on Guideline 5.1.1(iv). We have changed how NiX asks for permissions in the new build 1.0.13 (17):

- Welcome setup, "Camera and microphone" step: the "Allow Access" button is now "Continue", and it always leads to the iOS permission request. The "Not Now" button has been removed. The notifications step works the same way.
- After the user taps "Don't Allow", the app respects the choice and moves on. It no longer shows an "Open Settings" button. The camera tab only explains that camera access is off and that it can be turned on in Settings.
- The camera tab and the QR code scanner use "Continue" instead of "Allow" on the screen shown before the permission request.

We have selected build 1.0.13 (17) for this version and resubmitted it for review.

Best regards,
Damian Motyliński
NiX
