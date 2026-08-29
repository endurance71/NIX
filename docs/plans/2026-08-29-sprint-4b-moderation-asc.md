# Sprint 4B — smoke moderacji i pakiet ASC

**Status:** **ARCHIVE RECORDED / NOT UPLOADED**. P0-3 świadomie otwarte. P0-4 =
`CODE/PRODUCTION READY — DEVICE TEST DEFERRED`. Test urządzeniowy Sign in
with Apple **nie został wykonany**. Aplikacja **nie jest GO**. **Nie** `IN REVIEW`.
Upload IPA / Submit **nie** w tej rundzie.

Produkcja Edge: `moderation-admin` **v6**, `delete-account` **v6** (`verify_jwt=true`).
Migration head: `20260829170422` (w parze z `20260828100000`).
MCP `apply_migration` nadał removal timestamp `20260829170422` (log 17:04:22Z).
Lokalny plik wyrównany. Filtr tekstu wdrożony `db push --include-all` (nie repair).

Binary: IPA **1.0.11 (3)** ze źródła `858d5b1` (xcarchive build 2 → eksport 3).
Kolejny binary: `CFBundleVersion` **minimum 4**.

Pakiet do ręcznego wklejenia w ASC (poza Git, bez commitowania haseł):
`~/.nix-ops/sprint4b/ASC-PASTE.md`. Copy listing w [`docs/app-store-listing.md`](../app-store-listing.md).

## Backlog

- S5D — uporządkowanie statusów — **done**
- S6A — RPC + `moderation-admin` `remove` (prod **v6**) — **done**; timestamp pliku = prod
- S6B — **PRODUCTION RPC SMOKE PASS — MODERATION EDGE HAPPY-PATH PASS**
  (HTTP list/remove/decide/appeal 200 po rotacji `MODERATOR_API_SECRET` poza Git)
- S7 — copy ASC; **bez** zakazu testu Apple deletion
- S8 — **ARCHIVE RECORDED / NOT UPLOADED** — IPA `1.0.11` (3) z worktree `858d5b1`

## S8

**PASS (Archive nagrany, nie uploadowany).** 2026-08-29. Worktree detached `858d5b1`
(`check:ios-config`, `check:sentry-disabled`, `git diff --check -- ios` PASS).
Lokalny signed Archive + `exportArchive` `app-store-connect`. IPA **1.0.11 (3)**:
`aps-environment=production`, app group `group.com.damianmotylinski.nixapp.uploads`,
`applinks:nix.damianmotylinski.pl`, bundle `com.damianmotylinski.nixapp`.
xcarchive build 2 → IPA build 3. Kolejny build: **minimum 4**.
Dowód: `~/.nix-ops/sprint4b/IOS-ARCHIVE.md`. **Nie** `IN REVIEW`. Nie EAS.
Główne drzewo: brudny `ios/*` zostawiony; **nie** `git checkout -- ios/`.

## Granice

- bez Azure, RevenueCat, PR #9, issue #7, redeployu `delete-account` poza obecnym v6
- sekrety i dane testowe poza Git (`~/.nix-ops/`, ASC)
- smoke kasuje wyłącznie syntetyczne A/B/C
- `ios/*` nie commituje się razem z dokumentacją
- bez uploadu IPA do ASC/TestFlight bez jawnego potwierdzenia
