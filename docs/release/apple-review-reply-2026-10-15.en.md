# NiX — reply to App Review (2.1), 2026-10-15

**DRAFT — NOT SENT.** Device details from Settings → General → About on the recording iPhone
before copying. The same six answers go into App Review Information → Notes for version 1.0.13 (build 16).
Credentials stay only in the private ASC fields.

Recording file: `~/.nix-ops/app-review-video/NiX-App-Review-1.0.13-2026-10-15.mp4` (H.264, 720×1564, 10:30,
16 MB). Original: `~/Downloads/ScreenRecording_10-15-2026 11-39-20_1.MP4`. It is attached to the App Review
Information of version 1.0.13 as an App Review attachment.

## Reply text

Hello App Review Team,

Thank you for your request under Guideline 2.1. Below are the six requested items for NiX. The same information is
included in App Review Information > Notes, and the recording is attached there.

1. Physical-device recording

Recording: attached as "NiX-App-Review-1.0.13-2026-10-15.mp4" in App Review Information.
Device: iPhone 16 Pro Max, iOS 27.0.1. App: NiX 1.0.13, recorded on 15 October 2026 with build 15 plus our latest
over-the-air JavaScript update; the submitted build 16 contains exactly the same code.
Timeline: 0:00 device model and iOS version (Settings > General > About); 0:03 launching NiX from the Home
Screen; 0:07 registration with e-mail, password and date of birth (minimum age 16), e-mail code; 0:45 onboarding
and welcome tour; 1:50 sign out and sign in; 3:00 adding a friend by username and the friend accepting; 5:15 text
messages in both directions; 7:10 sending a photo and a short video, receiving a photo; 8:30 opening the received
photo and reporting it; 9:10 reporting a received message; 9:30 blocking the other user; 10:00 deleting the test
account. The other participant is a second test account. There are no paid features.
Received photos and videos are protected from screenshots and screen recording by default. For this demonstration
the sender allowed "Screenshot and save" for this one friend (Friend details), so the received photo is visible in
the recording; the protection itself was not turned off.

2. Purpose and audience

NiX is a consumer messaging app for people aged 16 and older who want to exchange short personal updates with
accepted friends. It offers private one-to-one text, photo, short-video and voice conversations with
limited-lifetime content, without a public feed. It is intended for the general public, not for a specific
employer or organization.

3. Setup and access

Sign in with the e-mail/password reviewer account in App Review Information (use the e-mail address, not the
username). The second reviewer account is in Notes; the two accounts are already friends, so open the existing
conversation to send and receive content. New users can register with e-mail or Sign in with Apple, confirm they
are at least 16 and complete onboarding. Report: long press a received message or NiX in a conversation, or ⋯ while
viewing a NiX. Block: ⋯ in the conversation header. Delete account: Profile > Delete account, with the password and
the username or e-mail as confirmation. No subscription, in-app purchase or sample file is required.

4. External services

Supabase provides authentication, database, storage and server functions. Apple provides Sign in with Apple and
push notifications (APNs). The binary is built locally with Xcode; Expo (EAS Update) delivers over-the-air
JavaScript updates and push delivery integration. Microsoft Azure AI Content Safety checks text, images and selected
video frames before delivery; an OVH-hosted worker prepares video frames for that check. Reports are reviewed by our
moderation team (nix@shipapp.pl), which can remove content and restrict or suspend accounts. There are no payment
providers, ads or subscriptions.

5. Regional behavior

Features and content rules are the same in every country or region where the app is available; there are no
country-specific paid features or content catalogs. The interface is in Polish and English, with English as the
fallback. The minimum age of 16 applies everywhere.

6. Regulated services and protected material

The app is a personal messaging service and does not provide regulated medical, financial, gambling or similar
services. It does not offer licensed third-party media. Users share their own content with accepted friends under
the app's Terms of Use and safety rules.

Thank you for reviewing NiX.
