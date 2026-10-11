# Przegląd przed App Review — NiX 1.0.13 (14), 2026-10-11

Kompleksowy przegląd wg App Store Review Guidelines (stan na aktualizację z 8.06.2026 + pytania o social
media w kategorii wiekowej, obowiązkowe od września 2026). Źródła: kod `main` @ `3f886d6`, stan App Store
Connect odczytany przez API (2026-10-11), dokumenty w `docs/release/`. Werdykt: **NIE gotowe do wysłania** —
poniżej lista blokerów w kolejności.

## Stan w App Store Connect

| Pole | Stan | Uwaga |
| --- | --- | --- |
| Ostatnie zgłoszenie | `8db797c3…` (1.0.11), 2026-09-12 → **UNRESOLVED_ISSUES** | Apple 13.09 poprosił (2.1 Information Needed) o nagranie z fizycznego urządzenia + 6 odpowiedzi. **Nikt nie odpowiedział** (szkic `apple-review-response-draft-2026-10-08.en.md` z placeholderami). |
| Wersja do wysyłki | **1.0.12**, PREPARE_FOR_SUBMISSION, build **10** | Trzeba zmienić na 1.0.13 i podpiąć build **14**. |
| Nazwa / podtytuł | „NiX Now Chat” / „Private photos for friends” (EN i **PL po angielsku**) | Podtytuł PL do przetłumaczenia. |
| Kategoria wiekowa | 16+ (override), `messagingAndChat=true`, `userGeneratedContent=false`, `socialMedia=false` | Odpowiedzi do potwierdzenia (UGC przy czacie 1:1). |
| Review Notes | o runtime 1.0.11, bez nowych funkcji | Do przepisania. |
| Konto demo | login w ASC = e-mail A; wcześniejsza próba logowania → `invalid_credentials` | Zweryfikować obie pary kont na buildzie 14. |
| What's New / opis | stare („First App Store review build”) | Do aktualizacji. |

## Blokery (muszą być zrobione przed wysyłką)

1. **Odpowiedź Apple na 2.1 + nagranie** — nagranie z fizycznego iPhone'a (rejestracja/logowanie, wysyłka
   tekstu/zdjęcia/wideo/głosówki, zgłoszenie, blokada, usuwanie konta) i 6 odpowiedzi (cel, dostęp, usługi
   zewnętrzne, regiony, usługi regulowane, materiały chronione). Bez tego kolejne zgłoszenie utknie.
2. **„Konto prywatne” nic nie robi (1.2, 2.3.1)** — `is_private` jest tylko kolumną i przełącznikiem;
   `get_public_profile_by_username` i polityka `friendships_insert` go nie sprawdzają, a wprowadzenie obiecuje
   „Znajdą Cię tylko osoby z Twoim kodem QR lub zaproszeniem” (`src/lib/i18n.ts` `welcome.setup.privacy`).
   Recenzent może to sprawdzić. **Naprawa:** egzekwować w RPC wyszukiwania i przy zaproszeniach (QR/invite
   omija), albo usunąć przełącznik i tekst.
3. **Głosówki bez moderacji i bez dowodów (1.2)** — `20261012101000_voice_messages.sql:21-23`: audio nie jest
   sprawdzane, dostarczane od razu, a `report-content` zapisuje tylko placeholder „🎤 0:12” (audio znika po
   24 h). **Naprawa minimum:** kopiować plik głosówki do `moderation-evidence` przy zgłoszeniu; docelowo
   transkrypcja + filtr przed dostarczeniem albo wyłączenie głosówek w buildzie do review.
4. **Polityka prywatności i App Privacy nieaktualne (5.1.1, 5.1.2)**:
   - zapisane wiadomości nie wygasają po 24 h (`20261012100000_text_message_saves.sql`), a polityka mówi
     „usuwane po 24 h”;
   - **głosówki (Audio Data)** nie są w polityce ani w App Privacy;
   - brak: historia edycji, odpowiedzi/przekazywanie (sprzeczne z „tylko dla wybranego odbiorcy”), zapis do
     Zdjęć przez odbiorcę, reakcje, serie, przypięcia/wyciszenia, passkeys, Wspomnienia (lokalnie).
   **Naprawa:** nowa wersja polityki (PL/EN, web + `legalDocuments.ts`, bump `LEGAL_DOCUMENT_VERSION`),
   uzupełnić App Privacy (User Content → Audio Data, Other User Content).
5. **Wersja 1.0.13 z buildem 14 w ASC, nowe Review Notes i What's New** — opisać nowe funkcje i gdzie są:
   wprowadzenie po logowaniu, czat (odpowiedź/edycja/cofnięcie/przekazanie, reakcje), głosówki, Wspomnienia,
   widżet, rozszerzenie udostępniania, powiadomienia komunikacyjne, aparat z ekranu blokady i Centrum
   sterowania. Uczciwie opisać OTA (patrz niżej).
6. **QA na buildzie 14 + działające konta demo** — macierz z `APP_REVIEW_FINAL_QA_2026-10-09.pl.md` (czysta
   instalacja, wylogowanie/przełączenie konta, zgłoszenie/blokada/usunięcie konta, odmowy uprawnień,
   VoiceOver, duży tekst, tryb zgodności na iPadzie, IPv6).
7. **DSA (status przedsiębiorcy) i regiony** — deklaracja w Business w ASC; wyłączyć Mac / Vision Pro, jeśli
   nietestowane.
8. **Zrzuty ekranu** — aktualne, bez zdjęć zastępczych z prawdziwymi twarzami.

## Wysokie ryzyko (naprawić przed wysyłką)

- **Rozszerzenie udostępniania otwiera aplikację przez responder chain** (2.5.1 / 4.4) —
  `ios/NixShareExtension/ShareViewController.swift:115-139` (`NSSelectorFromString("openURL:…")` +
  `unsafeBitCast`). Zostawić `extensionContext.open` + istniejący fallback (powiadomienie). Przy okazji
  `trace()` pisze `share-debug.log` w release — owinąć `#if DEBUG`. *Zmiana natywna → nowy build.*
- **Manifesty prywatności rozszerzeń** — tylko `ios/NiX/PrivacyInfo.xcprivacy`; rozszerzenie udostępniania
  czyta `creationDateKey` (FileTimestamp C617.1), a App Group UserDefaults wymaga **1C8F.1**;
  `NSPrivacyCollectedDataTypes` puste. Może dać ostrzeżenie/odrzucenie ITMS-91053. *Natywne.*
- **OTA z nowymi funkcjami vs 2.5.2 / 3.3.1(b)** — Review Notes deklarują OTA tylko na poprawki, a na
  runtime 1.0.13 poszło 35 OTA z funkcjami. Po akceptacji: OTA tylko poprawki, funkcje w nowych binarkach;
  flagi `EXPO_PUBLIC_*` dodać do `validate-release-env.mjs` (różnice `.env.local` vs `.env.production`).
- **Profile bez moderacji** (1.2) — avatar, nazwa wyświetlana i username nie przechodzą filtra; brak dowodu
  przy zgłoszeniu profilu i narzędzia „zresetuj avatar/nazwę”. Docelowo: Azure dla avatarów, filtr tekstu
  dla nazw.

## Średnie

- **4.1 kopia** — system emoji znajomych (🔥/⌛/😊/💛 z niemal identycznymi progami), „Wspomnienia”,
  „Najlepsi znajomi”, „Dostarczono/Otwarto”. Każdy element ogólny, razem może wyglądać na kopię Snapchata.
  Zmienić zestaw/progi emoji (np. SF Symbols NiX).
- **Zdjęcie z interfejsem Instagrama** we wprowadzeniu — `assets/onboarding/ephemeral.jpg` (ekran „LIVE”).
  Wymienić. Pozostałe zdjęcia zastępcze (Unsplash, licencja OK) — zastąpić finalną grafiką przed review.
- **Brak ścieżki „bezpieczeństwo dziecka”** — powód zgłoszenia z krytycznym priorytetem + procedura
  (zabezpieczenie dowodów, zgłoszenie odpowiednim organom), skoro użytkownicy mają 16–17 lat.
- **„Cofnij wysłanie” usuwa dowody** — miękkie usunięcie z ukrytą kopią ~30 dni dla moderacji.
- **Copy we wprowadzeniu** — „Zrzuty ekranu są domyślnie zablokowane” → „…NiX-ów” (czat nie jest chroniony);
  „nigdy nie trafia na serwer” → „zostaje zaszyfrowany na tym iPhonie” (folder trafia do kopii iCloud jako
  szyfrogram); „zobaczą wyłącznie ci…” → dopisać kontrolę bezpieczeństwa.
- **Ujawnienie Azure w aplikacji** — jedna linijka przed pierwszą wysyłką / we wprowadzeniu, poza samą polityką.
- **Kategoria wiekowa** — przejść cały nowy kwestionariusz (social media) i potwierdzić `userGeneratedContent`.

## Niskie

- Opis widżetu tylko po polsku (`NixInboxWidget.swift:13`).
- `Info.plist`: tryb tła `fetch` nieużywany; `PortraitUpsideDown` przy `portrait` w `app.json`;
  `NSAllowsLocalNetworking=true` (pozostałość deweloperska).
- Tekst zgody na aparat nie wspomina skanowania kodu QR; avatar prosi o pełny dostęp do biblioteki
  (lepiej systemowy picker).
- Przycisk „Oceń aplikację” woła `requestReview()` (bywa niewidoczny) — lepiej link `?action=write-review`.
- Regulamin: dopisać „zero tolerancji dla treści niedozwolonych i nadużyć”.
- Wiek sprawdzany tylko w aplikacji — zablokować ponowną próbę po wieku < 16.
- Podtytuł PL w ASC po angielsku; dokument `app-store-listing.md` mówi „NiX”, ASC „NiX Now Chat”.

## Zweryfikowane OK

- Brak płatności, reklam, śledzenia, ATT; `NSPrivacyTracking=false`; analityka i Sentry wyłączone flagą.
- Usuwanie konta w aplikacji z odwołaniem tokenu Sign in with Apple; czyszczenie Storage i lokalnych
  Wspomnień.
- Sign in with Apple obok e-maila i passkeys (4.8); brak logowania przez Google/Facebook.
- Zgłaszanie: NiX-y, teksty (z historią edycji), głosówki (bez audio — patrz bloker 3), profile; blokada w
  RLS; kontakt publiczny w aplikacji i dokumentach; moderacja przed dostarczeniem włączona dla tekstu,
  zdjęć i wideo.
- Push tylko transakcyjne; krok powiadomień do pominięcia; Live Activity tylko dla własnej kolejki wysyłki.
- Brak prywatnych API w kodzie aplikacji poza rozszerzeniem udostępniania; brak `eval`/WebView; ATS bez
  `NSAllowsArbitraryLoads`; brak sekretów w bundlu i logów z tokenami.
- Prośba o ocenę tylko systemowym API (5.6.1).
- Linki do polityki, regulaminu i wsparcia działają (200).

## Postęp

### Krok 1 — kod (gałąź `fix/app-review-preflight`)

| Punkt | Stan | Gdzie |
| --- | --- | --- |
| Konto prywatne egzekwowane | zrobione | `20261015100000_enforce_private_accounts.sql`: wyszukiwanie po nazwie pomija profile prywatne, a RLS `friendships_insert` odrzuca bezpośrednie zaproszenie. QR i link zaproszenia działają. Test: `supabase/tests/private_accounts_test.sql` (8/8). |
| Dowód przy zgłoszeniu głosówki | zrobione | `report-content` kopiuje nagranie do `moderation-evidence/{report}/evidence.m4a`; dozwolone typy audio w kubełku (`20261015101000_…`). Filtr audio przed dostarczeniem pozostaje otwarty. |
| Powód „Zagrożenie dla dziecka” | zrobione | `child_safety`: priorytet krytyczny (`20261015102000_…`), Edge Function, klient, i18n, procedura w `docs/moderation-runbook.md`. |
| Copy we wprowadzeniu, Azure, zdjęcie z Instagrama | zrobione | `src/lib/i18n.ts` (`welcome.*`), `assets/onboarding/ephemeral.jpg`, `CREDITS.md`. |
| Rozszerzenie udostępniania bez responder chain | zrobione | Zostały tylko `extensionContext.open` i powiadomienie; `trace()` działa wyłącznie w `#if DEBUG`. |
| Manifesty prywatności | zrobione | Własny manifest każdego rozszerzenia; aplikacja ma dodane 1C8F.1 i zbierane typy danych (`app.json` → `ios.privacyManifests`). Szczegóły: `docs/native-extensions.md`. |
| `Info.plist` | zrobione | Usunięty `fetch`; tekst zgody na aparat wspomina kody QR. Celowo zostają: `PortraitUpsideDown` (Expo ustawia go dla `portrait`; telefony z Face ID go ignorują) oraz `NSAllowsLocalNetworking` (dev build na iPhonie łączy się z Metro w sieci LAN; nie wymaga uzasadnienia w review). |
| Opis widżetu PL/EN | zrobione | `plugins/withWidgetExtras.js` (`localizeInboxDescription`). |
| Średnie: emoji serii (4.1), miękkie „cofnij wysłanie”, moderacja profili | otwarte | Poza krokiem 1; decyzja po wydaniu buildu 15. |

Zbierane typy danych w manifeście muszą się zgadzać z App Privacy w ASC (krok 2):
- e-mail, imię i nazwisko (nazwa wyświetlana), identyfikator użytkownika, identyfikator urządzenia (token push);
- wiadomości, zdjęcia i wideo, audio, inne treści użytkownika;
- wszystkie powiązane z kontem, bez śledzenia, cel: działanie aplikacji.

## Kolejność prac

1. Kod (OTA + build 15): egzekucja konta prywatnego, dowody głosówek, poprawki copy we wprowadzeniu,
   wymiana zdjęcia z Instagramem, rozszerzenie udostępniania bez obejścia, manifesty prywatności,
   `Info.plist`, opis widżetu (EN), powód „bezpieczeństwo dziecka”.
2. Prawne: nowa polityka prywatności + App Privacy (Audio Data itd.).
3. ASC: wersja 1.0.13 → build 15, Review Notes, What's New, opisy, podtytuł PL, kwestionariusz wiekowy,
   DSA, wyłączenie Mac/Vision Pro, zrzuty ekranu.
4. QA na buildzie 15 + nagranie z urządzenia + odpowiedź Apple na 2.1 → wysyłka.
