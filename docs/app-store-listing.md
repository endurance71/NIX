# NiX — copy App Store Connect

Wkleić w ASC. Nie obiecywać RevenueCat, NiX Circle ani subskrypcji.
Credentials demo wyłącznie w Review Information, nie tutaj.

Copy musi zgadzać się z binary `1.0.11 (6)` + OTA `production` / runtime `1.0.11`
oraz polityką **2026-09-12**: przed doręczeniem skanujemy tekst, zdjęcia i wybrane
klatki wideo (Azure AI Content Safety). Nie twierdzić, że mediów nie skanujemy.

## Identity

- Name: `NiX`
- Subtitle (EN, ≤30): `Private photos for friends`
- Subtitle (PL, ≤30): `Prywatne zdjęcia dla znajomych`
- Category: Social Networking
- Age rating: Messaging = Yes, 16+, not Kids
- Encryption: `ITSAppUsesNonExemptEncryption = false`

## Description (EN)

NiX is a private 1:1 messenger for accepted friends aged 16 and older. Send
ephemeral text, photos and short videos that are meant for one person, not a
feed. Report and block are available from the message menu. Before delivery we
automatically screen text, photos and selected video frames with Microsoft Azure
AI Content Safety to block disallowed content. Video is not a full-file scan.
There are no purchases, subscriptions, ads or tracking in this version.

## Description (PL)

NiX to prywatny komunikator 1:1 dla zaakceptowanych znajomych od 16. roku życia.
Wysyłasz efemeryczny tekst, zdjęcia i krótkie filmy do jednej osoby, nie na
tablicę. Zgłoszenie i blokada są w menu wiadomości. Przed doręczeniem
automatycznie skanujemy tekst, zdjęcia i wybrane klatki wideo przez Microsoft
Azure AI Content Safety, żeby zablokować treści niedozwolone. Wideo nie jest
pełnym skanem pliku. W tej wersji nie ma zakupów, subskrypcji, reklam ani
trackingu.

## Keywords (EN)

private messenger,friends,photos,video,ephemeral,chat,secure,1:1

## Keywords (PL)

komunikator,znajomi,zdjecia,wideo,efemeryczne,czat,prywatne

Nie używać: RevenueCat, Circle, subscription, premium, kids.

## What's New

First App Store review build of the private 1:1 messenger. Includes report,
block, in-app account deletion, optional push, and pre-delivery screening of
text, photos and selected video frames. No in-app purchases.

## URLs (public, no login)

- Privacy: `https://nix.damianmotylinski.pl/privacy`
- Terms: `https://nix.damianmotylinski.pl/terms`
- Support: `https://nix.damianmotylinski.pl/support`

## App Privacy (current binary)

Tracking = No. No IAP. Sentry SDK is hard-disabled (`EXPO_PUBLIC_SENTRY_ENABLED=false`)
and must not be declared as a diagnostics destination that currently receives data.
Product analytics is build-flag off (`EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=false`).

Declare only what this binary actually uses:

- Contact Info (email) — Account, linked, used for account
- User Content (messages, photos, video, reports) — App Functionality, linked
- Identifiers (user ID, installation/device token) — App Functionality, linked
- Diagnostics — not collected while Sentry is hard-off
- Product Interaction — **do not declare** while product analytics is off
- Purchases — none

Before enabling analytics: resolve audit P1-2 (Product Interaction linked vs unlink
`installation_id`), update ASC App Privacy, then set the build flag intentionally.

Used by: Apple (Sign in with Apple, APNs), Supabase (EU), Expo (builds, push relay),
Microsoft Azure AI Content Safety (pre-delivery screening).

## Operator paste checklist (public URLs)

Publish identical PL/EN content from `docs/legal/` (version **2026-09-12**) to:

- Privacy: `https://nix.damianmotylinski.pl/privacy`
- Terms: `https://nix.damianmotylinski.pl/terms`
- Support: `https://nix.damianmotylinski.pl/support`

In-app and pre-login screens use `src/lib/legalDocuments.ts` (same version). Keep ASC
Privacy Policy URL pointing at the public HTTPS page after publish.

## Screenshots

6.9" iPhone, fictional names and media. Show: inbox/chat, camera send, report
or block, profile safety. No RevenueCat, Circle, paywall or real user faces.

## Review Notes (paste into App Store Connect)

NiX is a private 1:1 messenger for accepted friends aged 16+. Please use the two
demo accounts in Review Information; they are already connected. Send a text, a
photo and a short video from account A, then open them on account B. Delivery
waits for automated screening: text, photos and selected video frames are checked
with Microsoft Azure AI Content Safety before the recipient sees them. Rejected
content is not delivered. Safety controls are also in the message menu: Report
and Block. Reports are reviewed by our moderation team, reported content can be
removed, and report evidence is deleted after 30 days. Account deletion is at
Profile → Account → Delete account and includes Sign in with Apple token
revocation. Push notifications and the upload Live Activity are optional. The
app is iPhone-only (`supportsTablet=false`) and may run in iPhone compatibility
mode on iPad. Expo OTA on channel `production` / runtime `1.0.11` is used only
for JavaScript and asset hotfixes on this binary, not for native changes. There
are no purchases, subscriptions, ads or tracking in this build.

## Review Information (non-secret)

- Two dedicated demo accounts, already friends — passwords only in ASC /
  `~/.nix-ops/sprint4b/demo-accounts.json`
- Contact email: `kontakt@damianmotylinski.pl`
- Binary to submit: `1.0.11 (6)` Internal TestFlight, already on App Store Connect
