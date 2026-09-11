# NiX — copy App Store Connect

Wkleić w ASC. Credentials demo i numer telefonu wyłącznie w Review Information,
nigdy w Git. Nie obiecywać RevenueCat, NiX Circle ani subskrypcji.

**Kanon aktualny (flaga `pre_delivery_moderation_enabled` = false):** zdjęcia i
wideo nie są skanowane automatycznie. Nie wklejaj sekcji „Po żywym C3”, dopóki
produkcja nie egzekwuje 1.2.

## Identity

- Name: `NiX`
- Subtitle (EN, ≤30): `Private photos for friends`
- Subtitle (PL, ≤30): `Prywatne zdjęcia dla znajomych`
- Category: Social Networking
- **Social Media questionnaire (od września 2026): No** — brak publicznego
  feedu, odkrywania obcych osób i postów; wyłącznie 1:1 między zaakceptowanymi
  znajomymi
- Age rating: Messaging = Yes, 16+, not Kids
- Encryption: `ITSAppUsesNonExemptEncryption = false`

## Description (EN) — current, flag off

NiX is a private 1:1 messenger for accepted friends aged 16 and older. Send
ephemeral text, photos and short videos that are meant for one person, not a
feed. Report and block are available from the message menu. Text messages pass a
basic backend keyword filter. Photos and videos are not automatically scanned.
There are no purchases, subscriptions, ads or tracking in this version.

## Description (PL) — current, flag off

NiX to prywatny komunikator 1:1 dla zaakceptowanych znajomych od 16. roku życia.
Wysyłasz efemeryczny tekst, zdjęcia i krótkie filmy do jednej osoby, nie na
tablicę. Zgłoszenie i blokada są w menu wiadomości. Tekst przechodzi podstawowy
filtr fraz po stronie serwera. Zdjęcia i wideo nie są skanowane automatycznie.
W tej wersji nie ma zakupów, subskrypcji, reklam ani trackingu.

## Description (EN) — po żywym C3 (nie wklejać wcześniej)

NiX is a private 1:1 messenger for accepted friends aged 16 and older. Send
ephemeral text, photos and short videos that are meant for one person, not a
feed. Report and block are available from the message menu. Before delivery we
check text and photos with an automated safety classifier in the EU, and we
sample video frames across the clip. This is not a frame-by-frame scan of every
video file. There are no purchases, subscriptions, ads or tracking in this
version.

## Description (PL) — po żywym C3 (nie wklejać wcześniej)

NiX to prywatny komunikator 1:1 dla zaakceptowanych znajomych od 16. roku życia.
Wysyłasz efemeryczny tekst, zdjęcia i krótkie filmy do jednej osoby, nie na
tablicę. Zgłoszenie i blokada są w menu wiadomości. Przed doręczeniem sprawdzamy
tekst i zdjęcia automatycznym klasyfikatorem bezpieczeństwa w UE oraz próbki
klatek wideo na osi czasu. To nie jest skan każdej klatki pliku. W tej wersji
nie ma zakupów, subskrypcji, reklam ani trackingu.

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

Pożywym C3 zsynchronizuj te URL z
[`legal/privacy-policy-post-enforcement.md`](legal/privacy-policy-post-enforcement.md)
oraz in-app `legalDocuments` (jedna treść, nowa data wersji).

## App Privacy

Tracking = No. No IAP. Social Networking category; Social Media features = No.

Sentry SDK is installed but uploads are hard-off. Internal TestFlight currently
sets `EXPO_PUBLIC_SENTRY_ENABLED=true` without a DSN in Git. For the **public**
binary 6+:

- jeśli runtime opt-in jest `true` — zadeklaruj Diagnostics zgodnie z tym, co
  binary naprawdę wysyła;
- jeśli `false` — nie deklaruj Diagnostics.

Declare only what this binary actually uses:

- Contact Info (email) — Account, linked, used for account
- User Content (messages, photos, video, reports) — App Functionality, linked
- Identifiers (user ID, installation/device token) — App Functionality, linked
- Diagnostics — match the Sentry runtime flag of that exact binary
- Product Interaction — do not declare unless product analytics is on
- Purchases — none

Used by: Apple (Sign in with Apple, APNs), Supabase (EU), Expo (builds, push
relay). Pożywym C3: Microsoft Azure Content Safety (Sweden Central) for
pre-delivery classification — update App Privacy and hosted `/privacy` in the
same change.

OTA (`expo-updates`, kanał `production`): wyłącznie hotfix JS/assets zgodny z
zatwierdzoną funkcją. Zmiana native / enforcement 1.2 wymaga nowego binary.

## Screenshots

6.9" iPhone, fictional names and media. Show: inbox/chat, camera send, report
or block, profile safety. No RevenueCat, Circle, paywall or real user faces.

## Review Information

- Two dedicated demo accounts, already friends — stored in ASC only
  (`~/.nix-ops/sprint4b/demo-accounts.json` locally)
- Contact email: `kontakt@damianmotylinski.pl`
- Phone: international format in ASC only (not Git)
- Review Notes (current, flag off):

> NiX is a private 1:1 messenger for accepted friends aged 16+. Please use the
> two demo accounts in Review Information; they are already connected. Send a
> text, photo and short video from account A, then open them on account B.
> Safety controls are available from the message menu: Report and Block. Text
> messages pass a basic backend keyword filter. Photos and videos are not
> automatically scanned. Reports are reviewed by our moderation team, reported
> content can be removed from the queue, and report evidence is deleted after
> 30 days. Account deletion is available at Profile → Account → Delete account
> and includes Sign in with Apple token revocation. Push notifications and the
> upload Live Activity are optional. There are no purchases, subscriptions, ads
> or tracking in this build.

- Review Notes (po żywym C3): zastąp zdanie o braku skanu mediów tekstem z
  opisu „Po żywym C3”. Nie twierdź „full video scan”.
