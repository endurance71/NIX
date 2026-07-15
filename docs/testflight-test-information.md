# NiX — dane do zewnętrznego TestFlight

Ten dokument jest szablonem operacyjnym. Pola oznaczone `MANUAL GATE` muszą być
uzupełnione w App Store Connect przed uruchomieniem workflow wysyłki.

## Beta App Description

NiX is a private visual messenger for people aged 16 and older. Accepted friends
can exchange ephemeral photo and video messages. The beta validates sign-in,
friend invitations, media capture/upload/view cleanup, account deletion, and the
report/block safety flow.

## What to Test

1. Sign in with the reviewer email account.
2. Add the second demo account by username or QR and accept the invitation.
3. Send one photo and one short video; open both on the recipient account.
4. Deny and then grant camera, microphone, and photo-library permissions.
5. Report one test message with reason “Other”; confirm it appears in Profile → Safety.
6. Block the sender; confirm messages and friendship disappear and a new invite is impossible.
7. Unblock in Profile → Safety. Confirm this does not automatically restore friendship.
8. Delete the reviewer account from Profile → Privacy Policy → Delete account.

Messages are private and are not automatically scanned. A copy is retained for
up to 30 days only when the recipient explicitly reports that message. Screenshot
protection is best-effort and depends on iOS.

## Sign-in information — MANUAL GATE

- Reviewer account 1: `[create dedicated email account]`
- Password / one-time-code procedure: `[store in App Store Connect, never here]`
- Reviewer account 2: `[create dedicated email account]`
- Username 1 / 2: `[fill after seeding]`
- Apple login may be tested on-device; Google Sign-In is not active. Email must allow full testing without private credentials.

## Contact — MANUAL GATE

- First name / last name: `[fill]`
- Phone: `[fill with country code]`
- Email: `kontakt@damianmotylinski.pl`

## App Store Connect — MANUAL GATE

- Privacy Policy URL is public over HTTPS and opens without authentication.
- App Privacy answers cover account identifiers, user content, diagnostics,
  Supabase, Apple, and Expo/EAS. Google Sign-In is inactive. The bundled Sentry SDK is hard-disabled.
- Age rating is consistent with the enforced minimum age of 16 and UGC/messaging.
- Export compliance is set consistently with `ITSAppUsesNonExemptEncryption=false`.
- TestFlight beta description, feedback email, reviewer contact and credentials are saved.
- The external tester group named in the manual workflow already exists.

## Review notes

The app is intentionally iPhone-only (`supportsTablet=false`). It may run in iPhone
compatibility mode on iPad. The backend must remain available during review.
Moderation is manual under the documented SLA. No purchases, subscriptions,
advertising, or tracking are present in this beta.
