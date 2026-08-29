# Sprint 4B — smoke moderacji i pakiet ASC

**Status planu:** niecommitowany do commitu S6A. P0-3 świadomie otwarte. P0-4 =
`CODE/PRODUCTION READY — DEVICE TEST DEFERRED`. Test urządzeniowy Sign in
with Apple **nie został wykonany**. Aplikacja **nie jest GO**. Submit for
Review **nie** jest w tej rundzie.

Historia migracji: lokalnie i remote przez `20260828100000` + `20260829170422`.
MCP `apply_migration` nadał removal timestamp `20260829170422` (log 17:04:22Z).
Lokalny plik wyrównany. Filtr tekstu wdrożony `db push --include-all` (nie repair).

## Backlog

- S5D — uporządkowanie statusów — **done**
- S6A — RPC + `moderation-admin` `remove` v5 — **done**; timestamp pliku = prod
- S6B — **PRODUCTION RPC SMOKE PASS — MODERATION EDGE HAPPY-PATH PASS**
  (HTTP list/remove/decide/appeal 200 po rotacji `MODERATOR_API_SECRET` poza Git)
- S7 — copy ASC; **bez** zakazu testu Apple deletion
- S8 — Archive z worktree `858d5b1`; **nie** `git checkout -- ios/`; bez Submit

## S8

Nie używać `git checkout -- ios/`. Stash path-specific albo czysty worktree z
`858d5b1`. Nie EAS.

## Granice

- bez Azure, RevenueCat, PR #9, issue #7, redeployu `delete-account` v5
- sekrety i dane testowe poza Git (`~/.nix-ops/`, ASC)
- smoke kasuje wyłącznie syntetyczne A/B/C
- `ios/*` nie commituje się razem z dokumentacją
