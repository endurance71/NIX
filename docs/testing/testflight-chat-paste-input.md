# TestFlight Internal — chat paste input

**Status:** INTERNAL TESTING — **NOT APPROVED FOR PUBLIC RELEASE**  
**Nie** Submit for Review. **Nie** External Testing. P0-3 pozostaje otwarte.  
Media **nie** są automatycznie moderowane. Nie opisywać funkcji jako skanowania obrazów.

## Zakres builda

- Marketing version: **1.0.11**
- Build number: **minimum 4** (nie nadpisuje kandydata App Review `1.0.11 (3)`)
- Pakiet: `expo-paste-input@0.2.2` (przypięty)
- Pipeline: Paste → validate → normalize → PhotoDraft → `/preview` → `/send-to` → `enqueueMediaBatch`
- Brak zmian bazy, Edge Functions i upload endpointu

## Feature flag

`EXPO_PUBLIC_CHAT_PASTE_INPUT_ENABLED`

| Środowisko | Wartość |
| --- | --- |
| Domyślnie / produkcja bez tej binarki | `false` — zwykły `TextInput` |
| Ten Internal TestFlight (`.env.production`) | `true` |

Rollback: ustawić `false` i wydać hotfix JS albo nowy binary. Jeśli wrapper natywny psuje pola mimo wyłączonej flagi, usunąć zależność i przebudować.

## Wspierane

- zwykłe wklejanie tekstu
- jeden statyczny obraz naraz
- JPEG, PNG, statyczny WebP
- statyczna naklejka iOS, jeżeli da się ją zdekodować i znormalizować
- preview, wybór odbiorcy, wysyłka po potwierdzeniu, retry istniejącej kolejki

## Świadomie niewspierane

- animowany GIF
- animowany WebP
- wiele obrazów naraz
- wideo
- zdalne URI (`http`, `https`, `data`, `ph`)
- automatyczna wysyłka
- nowa moderacja obrazów

## Instrukcja dla testera

Używaj **syntetycznych** obrazów i tekstów. Nie wklejaj prywatnej treści. Nie rób zrzutów schowka.

1. Otwórz czat z zaakceptowanym znajomym.
2. Wpisz tekst ręcznie, skasuj, zaznacz, wklej tekst na początku / w środku / na końcu.
3. Wyślij Enter/Send — outbox tekstowy bez regresji.
4. Wklej screenshot, PNG z przezroczystością, JPEG, statyczny WebP, naklejkę iOS.
5. Potwierdź przejście do preview (bez uploadu).
6. Anuluj preview — draft znika, nie ma wysyłki.
7. Wklej ponownie, na `/send-to` aktualny rozmówca jest zaznaczony, jeśli nadal jest znajomym.
8. Odznacz / zmień odbiorcę, potem wyślij.
9. Wklej GIF i kilka obrazów — czytelny komunikat, brak preview.
10. Pusty / nietypowy schowek — komunikat, tekst w composerze zostaje.
11. Retry uploadu, offline / background / resume.
12. Jasny i ciemny motyw, VoiceOver, klawiatura systemowa.
13. Inne pola tekstowe (auth, profil) bez regresji.
14. Sam fokus pola **nie** pokazuje promptu schowka.

## Release notes TestFlight

Adds experimental clipboard media support in chat. Internal testing should cover text paste, screenshots, static images, iOS stickers, preview cancellation, recipient selection, sending, retry, and temporary-file cleanup. Animated images and multiple images are intentionally unsupported.

## Macierz urządzenie / iOS

| Urządzenie | iOS | Tekst | Screenshot | PNG | JPEG | WebP | Naklejka | GIF reject | Multi reject | Preview cancel | Recipient | Send | Retry | VoiceOver | Light/Dark |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| | | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

Oznacz **PASS/FAIL**. Evidence poza Git: `~/.nix-ops/sprint5-paste-input/` (UTC, iOS, model, build, nazwa przypadku, PASS/FAIL, kod błędu bez payloadu).  
**Zakaz:** treść schowka, obrazy, e-mail, token, URI, nazwy plików, Apple ID, UUID, konta demo.

## GO / NO-GO Internal

GO Internal tylko gdy:

- testy automatyczne zielone
- tekst nie jest duplikowany
- obraz nie wychodzi bez preview
- peer walidowany przed preselection
- upload przez istniejącą durable queue
- cleanup nie kasuje cudzych plików
- brak treści/URI w logach
- development device PASS
- Archive i entitlements OK
- flaga włączona w tym internal buildzie
- build number > 3

**Nie podejmujemy GO dla publicznego App Store w tym dokumencie.**

## Rollback

1. `EXPO_PUBLIC_CHAT_PASTE_INPUT_ENABLED=false`
2. Composer wraca do zwykłego `TextInput`
3. Brak migracji i backendu do cofnięcia
4. Build `1.0.11 (3)` pozostaje nietknięty
