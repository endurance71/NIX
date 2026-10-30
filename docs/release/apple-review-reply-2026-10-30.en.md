# NiX — reply to App Review (2.1(a) launch crash), 2026-10-30

**SENT** on submission `8db797c3…` on 2026-10-30 at 09:48 (CET), before Update Review and Resubmit with build 16.
Status: [ios-current.md](ios-current.md).

---

Hello,

Thank you for reviewing NiX and for the report about Guideline 2.1(a).

We have not been able to reproduce a crash on launch with version 1.0.13 (16). We tested the same build in the following ways:

- The App Store-signed build 1.0.13 (16) installed from TestFlight on an iPhone 16 Pro Max running iOS 27.0.1. We signed out, deleted the app and installed it again, so it started without a saved session. The app launched to the sign-in screen, we signed in with the demo account provided in App Review Information, and the camera and messaging worked as expected.
- A fresh install of a Release build from the same source on an iPhone 17 Pro Max simulator running iOS 27, with the language set to English (US). The app launched to the sign-in screen without issues.
- In TestFlight, build 1.0.13 (16) is installed on 3 physical iPhones and has 178 sessions with 0 crashes reported. No crash reports for this build appear in Xcode Organizer either.

Because we cannot reproduce the issue, could you please attach the crash log (.ips) from your test device, or describe the steps that led to the app quitting? With the log we will be able to identify and fix the cause right away.

The demo account in App Review Information is active and ready to use.

We are resubmitting the same build for review. Thank you for your time.

Best regards,
Damian Motyliński
NiX
