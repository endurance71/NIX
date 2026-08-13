# NiX 1.0.9 (1) — Internal TestFlight

> Lokalny Xcode Archive i upload przez Organizer. Bez EAS Build, EAS Submit,
> grup zewnętrznych i Beta App Review.

## Źródło wydania

- [ ] Wszystkie zamierzone zmiany są na `release/ios-1.0.9-testflight`.
- [ ] Worktree jest czysty, a SHA kandydata zapisany poniżej.
- [x] Wersja, runtime i marketing version to `1.0.9`.
- [ ] Build `1` jest wolny w App Store Connect; w przeciwnym razie użyto `N+1`.
- [x] `.env.production` ma produkcyjne flagi, Sentry off i share invites off.

SHA RC: `pending`

## Automatyczne bramki

- [x] Typecheck, lint i pełne testy: 59 plików, 342 testy.
- [x] React Doctor full oraz files z untracked: `100/100`, 0 diagnostyk.
- [x] Expo Doctor `19/19`, Expo install check i Knip.
- [x] `check:ios-config`, `check:internal-testflight-config` i Sentry hard-off.
- [x] Kontrole migracji, Deno, bezpieczeństwa oraz produkcyjny eksport Hermes.
- [x] Build `NixMediaOverlay` i pełny Release arm64 zakończone powodzeniem.

Zweryfikowany bundle Release:

- `com.damianmotylinski.nixapp`, `1.0.9 (1)`;
- widget `com.damianmotylinski.nixapp.UploadStatusWidget`, `1.0.9 (1)`;
- runtime `1.0.9`, kanał OTA `production`;
- brak `NSLocalNetworkUsageDescription` i `NSBonjourServices`.

Przegląd `npm audit --omit=dev`: 14 raportowanych pozycji high pochodzi z
jednego transytywnego `image-size <= 2.0.2` w toolchainie Metro/Expo. Pakiet nie
jest wykonywany w aplikacji na urządzeniu; przetwarza kontrolowane assety podczas
lokalnego bundlowania. `npm audit fix --force` proponuje niezgodny downgrade Expo
57 do 53, dlatego ryzyko jest zaakceptowane dla tego RC do czasu poprawki upstream.

## Smoke Release

- [ ] Release działa na fizycznym iPhonie bez Metro i z produkcyjnym Supabase.
- [ ] Logowanie, kamera, mikrofon, galeria, push, deep link i restart działają.
- [ ] Zdjęcie i wideo: naklejki, formatowanie, rysowanie, undo/redo, zapis i wysyłka.
- [ ] Preview, galeria i odbiorca mają zgodną geometrię i kolory overlayów.
- [ ] Dwa konta i dwa iPhone’y przeszły scenariusze z `internal-testflight-what-to-test.md`.

## Archive i dystrybucja

- [ ] Archive Release ma `1.0.9 (1)`, właściwy Bundle ID i runtime `1.0.9`.
- [ ] Podpis dystrybucyjny, App Groups i `aps-environment=production` są poprawne.
- [ ] Organizer potwierdził `Uploaded to Apple`, a Processing zakończył się.
- [ ] Export Compliance i What to Test są uzupełnione.
- [ ] Build przypisano wyłącznie do `NiX Internal QA`.

## Akceptacja i obserwacja

- [ ] Brak P0/P1, błędów bake/bridge, utraty lub duplikacji mediów.
- [ ] TestFlight Crashes, Organizer i logi Supabase sprawdzono po smoke, 24h i 48h.

Status: **NO-GO**, dopóki wszystkie pozycje przed dystrybucją nie są zakończone.
