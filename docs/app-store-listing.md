# NiX — copy App Store Connect (Sprint 4B)

Wkleić w ASC. Nie obiecywać RevenueCat, NiX Circle, subskrypcji ani automatycznego
skanowania mediów. Credentials demo wyłącznie w Review Information, nie tutaj.

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
feed. Report and block are available from the message menu. Text messages pass a
basic backend keyword filter. Photos and videos are not automatically scanned.
There are no purchases, subscriptions, ads or tracking in this version.

## Description (PL)

NiX to prywatny komunikator 1:1 dla zaakceptowanych znajomych od 16. roku życia.
Wysyłasz efemeryczny tekst, zdjęcia i krótkie filmy do jednej osoby, nie na
tablicę. Zgłoszenie i blokada są w menu wiadomości. Tekst przechodzi podstawowy
filtr fraz po stronie serwera. Zdjęcia i wideo nie są skanowane automatycznie.
W tej wersji nie ma zakupów, subskrypcji, reklam ani trackingu.

## Keywords (EN)

private messenger,friends,photos,video,ephemeral,chat,secure,1:1

## Keywords (PL)

komunikator,znajomi,zdjecia,wideo,efemeryczne,czat,prywatne

Nie używać: RevenueCat, Circle, subscription, premium, scan, kids.

## What's New

First App Store review build of the private 1:1 messenger. Includes report,
block, account deletion and optional push notifications. No in-app purchases.

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

Used by: Apple (Sign in with Apple, APNs), Supabase (EU), Expo (builds, push relay).

## Operator paste checklist (public URLs)

Publish identical PL/EN content from `docs/legal/` (version **2026-09-05**) to:

- Privacy: `https://nix.damianmotylinski.pl/privacy`
- Terms: `https://nix.damianmotylinski.pl/terms`
- Support: `https://nix.damianmotylinski.pl/support`

In-app and pre-login screens use `src/lib/legalDocuments.ts` (same version). Keep ASC
Privacy Policy URL pointing at the public HTTPS page after publish.

## Screenshots

6.9" iPhone, fictional names and media. Show: inbox/chat, camera send, report
or block, profile safety. No RevenueCat, Circle, paywall or real user faces.

## Review Information

- Two dedicated demo accounts, already friends — stored in ASC only
  (`~/.nix-ops/sprint4b/demo-accounts.json` locally)
- Contact email: `kontakt@damianmotylinski.pl`
- Review Notes: `docs/APP_STORE_REVIEW_AUDIT_2026-08-26.md` section 12
