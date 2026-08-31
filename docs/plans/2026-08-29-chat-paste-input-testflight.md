# Chat paste input — TestFlight Internal

**Status:** CODE READY — **TESTFLIGHT INTERNAL DEVICE QA PENDING**

**Branch:** `codex/chat-paste-input`

**Baza:** `5dfbcba` (`codex/sprint-4-minimal-app-review`, czysty SHA)

**Pakiet:** `expo-paste-input@0.2.2` (przypięty, bez `^`)

**Kandydat App Review:** build **1.0.11 (3)** z `858d5b1` — **nietknięty**

**Ten binary:** marketing `1.0.11`, `CFBundleVersion` **4**

**P0-3:** otwarte. Media **nie** są automatycznie moderowane. Nie opisywać funkcji jako skanowania obrazów.

## Rozbieżności względem briefu (S0)

Stan na 2026-08-29, zmierzony — nie założony:

| Założenie briefu | Stan faktyczny |
| --- | --- |
| Główne drzewo może mieć brudne `ios/*` | Potwierdzone na `codex/sprint-4-minimal-app-review`: `ios/.xcode.env`, widget, `project.pbxproj`, `Info.plist`, `Expo.plist`, `InfoPlist.strings`. **Nie ruszane.** |
| Archive `1.0.11 (3)` | Potwierdzone w `docs/plans/2026-08-29-sprint-4b-moderation-asc.md`: IPA z `858d5b1`, xcarchive build 2 → eksport 3 |
| HEAD = SHA Archive | **Rozbieżność:** HEAD bazy to `5dfbcba` (docs Sprint 4B po Archive). Worktree wzięty z `5dfbcba`, nie z brudnego `ios/*` i nie z `858d5b1`. |
| `app.json` `ios.buildNumber` | Ustawione na `"4"` wraz z aplikacją, widgetem i `CURRENT_PROJECT_VERSION`. Build 3 pozostaje nietknięty. |
| Feature flags | Istnieją: `EXPO_PUBLIC_*` (`iosRoadmapFeatures`, `uploadFeatures`, `.env.production`). Nowa flaga: `EXPO_PUBLIC_CHAT_PASTE_INPUT_ENABLED`. |
| Worktree | Był tylko główny katalog. Izolacja: `/Volumes/External-drive-lexar/Dev/Projects/NIX-chat-paste-input`. |

## Zakres MVP

Obsługujemy:

1. Zwykłe wklejanie tekstu (natywny `TextInput` + `onChangeText`; **bez** ręcznego `setInputBody`).
2. Jeden statyczny obraz naraz.
3. JPEG, PNG, statyczny WebP.
4. Statyczną naklejkę iOS, jeśli natywny dekoder ją otworzy i znormalizuje.
5. Istniejący `/preview` → `/send-to` → `enqueueMediaBatch`.
6. Sugerowany odbiorca = aktualny `peerId`, tylko gdy jest na liście zaakceptowanych znajomych.
7. Wysyłka wyłącznie po potwierdzeniu użytkownika.
8. Testy TestFlight Internal.

Świadomie poza MVP: animowany GIF / animowany WebP, wiele obrazów, wideo, zdalne URI, auto-send, nowy upload endpoint, DB, Edge Functions, nowa moderacja obrazów.

`uris.length !== 1` → odrzuć całość (nie wybieraj pierwszego obrazu).

## Pipeline

```text
Paste → validate → normalize → PhotoDraft (ownedTemporaryUris)
  → /preview?recipientId=
  → /send-to (preselect iff accepted friend)
  → enqueueMediaBatch (istniejąca durable queue)
```

Brak uploadu przed potwierdzeniem. Brak nowej ścieżki uploadu.

## Feature flag

- `EXPO_PUBLIC_CHAT_PASTE_INPUT_ENABLED`
- Domyślnie **false** (composer = dotychczasowy `TextInput`).
- Ten branch Internal: `true` w `.env.production`.
- Rollback: ustawić `false` — bez migracji, bez backendu.
- Jeśli natywny wrapper psuje pola mimo wyłączonej flagi → osobny commit usuwający zależność i nowy binary.

## Bramki

### S1 — kompatybilność natywna przed Archive

- brak ręcznego patcha Swift/Kotlin i brak forka
- natywny moduł kompiluje się z Expo 57 / RN 0.86
- testy JS, typecheck i statyczne bramki są zielone
- właściwe testy fokusu, klawiatury i wklejania odbywają się na fizycznym iPhonie z TestFlight Internal

**Stan 2026-08-29:**

- `expo-paste-input@0.2.2` przypięty bez `^`
- `pod install` dodał `ExpoPasteInput` (deployment target podniesiony do 16.4)
- inspekcja Swift: Expo Module, bez forka; `canPerformAction` nie czyta schowka (brak promptu na fokus)
- `xcodebuild` Debug Simulator **BUILD SUCCEEDED** (~27 min); `ExpoPasteInput` skompilowany bez patcha
- **device test na fizycznym iPhonie: PENDING** — bramka wewnątrz TestFlight Internal przed External Testing lub publicznym App Review

Jeśli RN 0.86 / Expo 57 wymaga patcha → **HOLD**. Nie iść do Archive.

### S2–S8 — kod

Domain `src/lib/chatPaste.ts`, cleanup owned temp, composer wrapper, i18n, testy.

### S9 — checki lokalne

Vitest, typecheck, lint, Knip, Expo Doctor, `check:ios-config`, `git diff --check`, media/upload tests. Nie naprawiać niepowiązanego baseline bez zgody.

### S10 — device w TestFlight Internal

Macierz w `docs/testing/testflight-chat-paste-input.md`. Syntetyczne obrazy/teksty. Brak prywatnych treści w evidence. TestFlight Internal jest bramką urządzeniową przed jakąkolwiek dystrybucją zewnętrzną lub publicznym App Review.

### S11–S12 — Archive / TestFlight Internal

- Build number **4**, nie nadpisywać 3.
- Lokalny Xcode Archive, **nie** EAS, **nie** Submit for Review, **nie** External Testing.
- IPA poza Git. Evidence: `~/.nix-ops/sprint5-paste-input/`.

## Rollback

1. `EXPO_PUBLIC_CHAT_PASTE_INPUT_ENABLED=false`
2. Composer wraca do zwykłego `TextInput`
3. Brak migracji / backendu do cofnięcia
4. Build 3 nietknięty
5. Awaryjnie: usunąć `expo-paste-input` i przebudować

## GO Internal Testing (ten binary)

- testy automatyczne zielone
- tekst nie duplikowany
- obraz nie wychodzi bez preview
- peer walidowany przed preselection
- upload przez istniejącą durable queue
- cleanup nie kasuje cudzych plików
- brak treści/URI w logach
- Archive + entitlements OK
- flaga włączona w tym internal buildzie
- build number > 3

Device PASS jest kryterium wyjścia z TestFlight Internal, a nie warunkiem uploadu do grupy wewnętrznej.

**Nie podejmujemy decyzji GO dla publicznego App Store w tym zadaniu.**
