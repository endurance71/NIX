# NiX — dane do zewnętrznego TestFlight

Ten dokument jest szablonem operacyjnym. Loginy, hasła i OTP **nie należą
do Git** — wyłącznie App Store Connect.

## Beta App Description

NiX is a private visual messenger for people aged 16 and older. Accepted friends
can exchange ephemeral text, photo and video messages. The beta validates sign-in,
friend invitations, profile editing, media capture/upload/view cleanup, report,
block, and moderator content removal. Messages are not automatically scanned.

## What to Test

1. Sign in with the reviewer email account stored in App Store Connect.
2. The second demo account is already an accepted friend.
3. Send one text, one photo and one short video; open them on the recipient account.
4. Deny and then grant camera, microphone, and photo-library permissions.
5. Report one test message with reason “Other”; confirm it appears in Profile → Safety.
6. Block the sender; confirm messages and friendship disappear and a new invite is impossible.
7. Unblock in Profile → Safety. Confirm this does not automatically restore friendship.

## Store listing

Pełny copy (subtitle, description PL/EN, keywords, App Privacy, Review Notes):
`docs/app-store-listing.md`. Hasła demo wyłącznie w App Store Connect.

## Sign-in information — stored in App Store Connect only

- Reviewer account 1: dedicated demo email (ASC Review Information)
- Password / one-time-code procedure: stored in App Store Connect only
- Reviewer account 2: dedicated demo email (ASC Review Information)
- Usernames: stored in App Store Connect only after seeding
- Email login must allow full testing without the owner’s private mailbox

## Contact — stored in App Store Connect

- First name / last name / phone: App Store Connect Review Information
- Email: `kontakt@damianmotylinski.pl`

## App Store Connect checklist

- Privacy Policy URL `https://nix.damianmotylinski.pl` (or the published legal URL) opens over HTTPS without authentication.
- Terms and Support URLs open without login.
- App Privacy matches this binary: account identifiers, user content, diagnostics, Supabase, Apple, Expo. Sentry SDK is hard-disabled. No tracking, no IAP.
- Age rating: Messaging = Yes, 16+, not Kids.
- Export compliance consistent with `ITSAppUsesNonExemptEncryption=false`.
- Screenshots 6.9" use fictional data.
- Description, subtitle, keywords and What's New do not mention RevenueCat, NiX Circle, subscriptions, or automatic media scanning.

## Review notes

See `docs/APP_STORE_REVIEW_AUDIT_2026-08-26.md` section 12. The app is iPhone-only
(`supportsTablet=false`) and may run in iPhone compatibility mode on iPad.
The backend must remain available during review. Moderation is manual.
No purchases, subscriptions, advertising, or tracking.
