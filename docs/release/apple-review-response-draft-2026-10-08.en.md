# NiX — draft reply to App Review, 2026-10-08

**LOCAL DRAFT — NOT SENT.** Complete the evidence fields and confirm the statements for the exact submitted build before copying the reply. Do not include this preparation section in App Store Connect. Put the same six-part information in App Review Information → Notes as Apple requested. Credentials belong only in the private ASC fields/Notes, never in this document.

Preparation requirements:

- Public privacy/terms/support pages in PL/EN have been restored and passed the hosting validator. Verify they remain accessible at final QA.
- Candidate: public-eligible 1.0.12 (10), runtime 1.0.12, production channel. Local Release Archive 10 passed; public signing/export/upload is blocked on Xcode account login. Processing, selection and final QA for 10 remain pending; build 9 upload is historical evidence. The original rejection concerns 1.0.11 (6). Version metadata is now 1.0.12, with build 6 removed and build 10 not yet selected.
- Check both connected reviewer accounts and all recorded flows on the chosen candidate, including the current production backend and moderation operations.
- Provide a recording captured on a physical device with the latest supported stable OS. Identify model, OS, build and date; verify reviewer access to the recording.
- Mac and Vision Pro availability have been disabled in ASC; 175 regions and free access are preserved. DSA declaration is missing in Business. Verify China mainland ICP applicability and all other regional requirements.
- Replace every bracketed field below. This draft does not claim that those checks have already passed.
- The reply section is approximately 3,543 characters before completing the fields; check the final length against ASC's 4,000-character limit. Use Notes for longer operational instructions without omitting any of Apple's six answers from the reply.

## Reply text

Hello App Review Team,

Thank you for your request under Guideline 2.1. Below are the six requested items for NiX Now Chat. The same information is included in App Review Information > Notes.

1. Physical-device recording

Recording: [ACCESSIBLE RECORDING LINK / ATTACHMENT NAME].
Device: [MODEL], OS: [EXACT VERSION], app: 1.0.12 (10), tested: [DATE].
The recording begins with launching the app and shows registration, onboarding, login, a typical conversation with an accepted friend, sending and receiving text/photos/short videos, content reporting, user blocking, and deletion of a separate test account. [SEGMENT TIMESTAMPS IF NEEDED]. There are no paid features to demonstrate. Reviewer accounts remain active and connected. [EXPLAIN ANY DEMONSTRATED SCREEN-CAPTURE PROTECTION IF APPLICABLE].

2. Purpose and audience

NiX Now Chat is a consumer messaging app for people aged 16 and older who want to exchange short personal updates with accepted friends. It offers private one-to-one text, photo and short-video conversations with limited-lifetime content, without a public feed. Its value is a focused way to share everyday moments with known contacts. It is intended for the general public, not a specific employer or organization.

3. Setup and access

Use the email/password reviewer account in App Review Information; the second connected account is provided in the private Notes. Sign in using the email address, not the username. The two accounts are already connected, so no new friend request is required. [CONFIRM BOTH ACCOUNTS TESTED ON DATE/BUILD]. Open the existing conversation to send and receive content. New users can register or use Sign in with Apple, complete onboarding and confirm they are at least 16. Content reporting and blocking are available through a long press on a conversation message (Report), and the conversation header menu (Block). Account deletion is available through Profile > Account > Delete account with the required reauthentication. No subscription, in-app purchase or sample file is required.

4. External services

Supabase provides authentication, database, storage and server functions. Apple provides Sign in with Apple and APNs. The submitted binary is built locally with Xcode; Expo/EAS provides OTA updates and push delivery integration; upload status uses iOS Live Activities. Azure AI Content Safety supports automated pre-delivery checks of text, images and selected video frames. An OVH-hosted worker processes video for that moderation workflow. Selected-frame checks do not constitute full-video scanning. Reporting and blocking complement automated checks. [CONFIRMED HUMAN REPORT-HANDLING PROCESS]. Support: kontakt@damianmotylinski.pl. There are no payment providers, ads or subscriptions.

5. Regional behavior

[CONFIRM OR REPLACE:] Core features and content rules are consistent across the countries/regions selected for distribution; there are no country-specific paid features or content catalogs. The interface is localized in Polish and English, with English fallback. The app enforces a minimum age of 16 across regions. [LIST ANY SERVICE OR REGIONAL RESTRICTIONS, IF PRESENT].

6. Regulated services and protected material

The app is a personal messaging service and does not provide regulated medical, financial, gambling or similar services. It does not offer a licensed third-party media catalog. Users share their own content with accepted contacts under the app's terms and safety rules. The app does not provide a curated or licensed content catalog; user-generated material is subject to the app's terms and safety rules.

Thank you for reviewing NiX Now Chat.

## Notes preparation

Keep the reviewer login fields populated privately. Copy the completed six-part reply into Notes and add the second account credentials there, together with exact tested navigation instructions. Preserve the useful explanation of optional notifications/Live Activities, limited-lifetime media, account deletion, and moderation, but update runtime/version information to match the chosen candidate. Do not state that the recording, URL repair, regional checks or production QA passed until the evidence exists.
