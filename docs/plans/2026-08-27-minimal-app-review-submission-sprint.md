# Sprint 4 — minimalny kandydat do App Review

> **Historical execution plan.** For the current binary and App Review state,
> use [`../release/ios-current.md`](../release/ios-current.md).

## Cel sprintu

W ciągu pięciu dni przygotować i wysłać do App Review prawdziwy, stabilny build
NiX bez płatnej moderacji, zamykając P0-4 i operacyjne bramki P0-5, przy jawnym
zaakceptowaniu ryzyka odrzucenia za brak automatycznego filtrowania mediów P0-3.

## Werdykt i ograniczenie zakresu

Ten sprint nie zmienia audytowego `NO-GO` na `GO`. Jest świadomą próbą uzyskania
rzeczywistej decyzji Apple przy minimalnym koszcie.

- koszt nowych usług: 0 USD;
- Azure, Google, AWS, Hive i płatny worker: poza zakresem;
- PR #9 / ADR-001 pozostaje `Proposed` i nie uruchamia expand;
- media nie są opisywane jako automatycznie skanowane;
- brak P0-3 jest wpisany do release decision jako zaakceptowane ryzyko;
- każde pytanie reviewera otrzymuje zgodną z prawdą odpowiedź.

## Stan P0-4 (2026-08-29)

**P0-4 = CODE/PRODUCTION READY — DEVICE TEST DEFERRED.** S4 i sekrety oraz
`delete-account` v5 są na produkcji. Kontrolowany test urządzeniowy Sign in
with Apple jest odroczony i nie został wykonany. Następne: Sprint 4B
(S5D–S8). P0-3 pozostaje świadomie otwarte.

## Pojemność

- czas: 5 dni roboczych;
- zespół: 1 deweloper + właściciel kont App Store Connect;
- dostępność: 40 godzin idealnych;
- commitment: 32 godziny;
- bufor: 8 godzin (20%) na test urządzeniowy Sign in with Apple, signing i problemy urządzeń;
- właściciel zewnętrznych bramek: właściciel produktu.

## Backlog

| # | Historia | Kryterium akceptacji | Estymacja | Zależności |
| --- | --- | --- | ---: | --- |
| S0 | Domknąć T+24 | Issue #6 przechodzi po 2026-08-28 10:41 CEST, audyt zawiera wynik i issue jest zamknięte | 1 h | czas |
| S1 | Podstawowy filtr tekstu | Backend normalizuje Unicode, wielokrotne odstępy i proste obfuskacje PL/EN; testy blokują uzgodnione wysokie ryzyko bez logowania treści | 4 h | brak |
| S2 | Usunąć Apple nonce fallback | Logowanie Apple nigdy nie ponawia `signInWithIdToken` bez nonce; regresje mają testy | 2 h | brak |
| S3 | Apple revoke — klient | Reautoryzacja przy usuwaniu pozyskuje świeży `authorizationCode`; kod trafia wyłącznie do `delete-account`, nie do logów ani storage klienta | 4 h | S2 |
| S4 | Apple revoke — backend | Backend wymienia code, odwołuje token Apple, obsługuje already-revoked idempotentnie; błąd przejściowy nie usuwa konta i pozwala bezpiecznie ponowić | 7 h | S3, sekrety Apple |
| S5 | Test i rollout P0-4 | Sekrety Apple poza repo, deploy wyłącznie `delete-account` z JWT, kontrolowany test Sign in with Apple na fizycznym urządzeniu (dev/TestFlight), smoke konta Apple i email | 4 h | S4, sekrety Apple, urządzenie |
| S6 | Operacyjny smoke bezpieczeństwa | Report → block → moderation list → removal/decision → appeal → cleanup; zapisane wyłącznie identyfikatory i wyniki, bez treści | 3 h | produkcja, moderator |
| S7 | Pakiet App Store Connect | Dwa konta demo, kontakt, App Privacy, rating, screenshoty, opis, keywords, What's New i uczciwe Review Notes bez obietnic skanowania mediów | 3 h | właściciel ASC |
| S8 | Archive, urządzenia i submission | Podpisany Archive, production APS, clean-install smoke na iPhonie, minimum iPad compatibility, wybór tego samego buildu i wysłanie do review | 4 h | S5–S7 |

Łącznie: 32 godziny. Bufor: 8 godzin.

## Definition of Ready

Przed rozpoczęciem S4:

- Apple Developer Team ID, Key ID, Client ID i prywatny klucz są dostępne
  operatorowi i nigdy nie trafiają do Git ani `EXPO_PUBLIC_*`;
- konfiguracja Sign in with Apple odpowiada bundle ID finalnego buildu;
- jest fizyczne urządzenie i Apple Account do kontrolowanego testu Sign in with Apple (nie Sandbox IAP);
- uzgodniono zachowanie fail-closed: przy awarii revoke konto nie jest częściowo
  usuwane, użytkownik dostaje komunikat retry.

Przed rozpoczęciem S7–S8:

- istnieją dwa dedykowane konta demo bez prywatnej korespondencji;
- konta są zaakceptowanymi znajomymi i mają stabilne dane logowania;
- właściciel podaje prawdziwe imię, nazwisko, telefon i email kontaktowy;
- dostępny jest iPhone, a także iPad lub tryb compatibility do krótkiego smoke;
- backend, deep links, email confirmation i support pozostaną aktywne podczas
  całego review.

## Kontrakt P0-4

### Klient

1. Użytkownik wybiera usunięcie konta.
2. Dla konta Apple aplikacja wymaga świeżej reautoryzacji.
3. Credential musi zawierać `authorizationCode`; jego brak zatrzymuje operację.
4. Kod jest wysyłany po TLS w body uwierzytelnionego `delete-account`.
5. Kod nie jest zapisywany, ponownie używany ani logowany.

### Backend

1. Zweryfikować sesję Supabase z Bearer tokenu i to, że użytkownik ma provider Apple.
2. Wygenerować krótkotrwały Apple client secret po stronie serwera.
3. Wymienić świeży `authorizationCode` na token Apple po stronie backendu.
   Nie używać tego kodu do `signInWithIdToken` po stronie klienta.
4. Odczytać `sub` z odpowiedzi Apple i porównać z Apple ID przypisanym do
   użytkownika z bieżącego Bearer tokenu.
5. Mismatch `sub` / Apple ID → brak revoke i brak usunięcia konta.
6. Dopiero po zgodności: revoke → cleanup danych → `delete user`.
7. `invalid_token` / token już odwołany traktować idempotentnie zgodnie z
   udokumentowanym kontraktem Apple; błędy przejściowe pozostają retryable
   i nie mogą częściowo usunąć konta.
8. Dla kont nie-Apple zachować obecny flow bez wymagania authorization code.

Sekrety backendu: nazwy i dokładny format zostaną ustalone w implementacji, ale
obejmują wyłącznie server-side Team ID, Key ID, Client ID oraz klucz podpisujący.

## Minimalny filtr tekstu

Zakres S1 jest celowo ograniczony:

- NFKC/NFC zgodnie z decyzją implementacyjną i usunięcie znaków niewidocznych;
- lowercase, redukcja powtarzanych separatorów i whitespace;
- proste warianty leetspeak tylko dla krótkiej, udokumentowanej listy;
- zestaw wysokiego ryzyka PL/EN dotyczący realnych gróźb, samookaleczenia i
  jednoznacznych treści zabronionych;
- egzekwowanie w bazie/backendzie, nie tylko w interfejsie;
- testy false-positive dla zwykłej rozmowy;
- brak zapisu odrzuconej treści w logach.

Nie przedstawiamy tego jako kompletnej moderacji semantycznej ani filtra mediów.

## P0-5 — pakiet review

### Konta demo

- konto A i B są dedykowane wyłącznie review;
- są już zaakceptowanymi znajomymi;
- instrukcja prowadzi: login A → tekst/zdjęcie/wideo → login B → odbiór → report
  → block → account deletion;
- hasła i procedura OTP znajdują się wyłącznie w App Store Connect;
- reviewer nie potrzebuje prywatnej skrzynki właściciela.

### Metadata

- `Messaging = Yes`, age rating zgodny z minimum 16+, aplikacja nie jest Kids;
- Privacy Policy URL i Support URL działają bez logowania;
- App Privacy odpowiada finalnemu binary i wyłączonej analityce;
- opis nie obiecuje RevenueCat, NiX Circle, subskrypcji ani automatycznego
  skanowania mediów;
- screenshoty 6.9 cala używają fikcyjnych danych;
- TestFlight/Review Information nie zawiera placeholderów.

### Uczciwe Review Notes

Review Notes mają opisać:

- prywatną komunikację 1:1 wyłącznie między zaakceptowanymi znajomymi;
- age gate 16+;
- podstawowy backendowy filtr tekstu;
- Report i Block dostępne z menu wiadomości;
- ręczną obsługę zgłoszeń i 30-dniową retencję dowodów;
- usunięcie konta wraz z Apple token revocation;
- brak zakupów, reklam i trackingu.

Nie wpisywać zdania `Text and media are screened before delivery`, ponieważ media
nie są automatycznie skanowane. Nie trzeba prowokacyjnie podkreślać braku skanu,
ale na bezpośrednie pytanie odpowiedzieć zgodnie z prawdą.

## Minimalna macierz urządzeń

Przed submission muszą przejść:

- clean install i upgrade;
- logowanie email i Apple;
- zaproszenie/zaakceptowana znajomość;
- tekst, zdjęcie i krótki film A→B;
- kamera, mikrofon i biblioteka: allow oraz deny;
- upload w tle, push i Live Activity;
- report, block, unblock, moderation decision i appeal;
- usunięcie konta email oraz Apple;
- offline → online i podstawowy retry;
- Light/Dark, największy Dynamic Type i podstawowa nawigacja VoiceOver;
- iPhone oraz uruchomienie w iPad compatibility;
- Privacy/Terms/Support i deep links;
- brak sekretów, pełnych lokalnych URI oraz treści wiadomości w logach Release.

Pełna macierz NAT64 i długie testy recovery mogą wykorzystać bufor. Krytycznych
ścieżek auth, upload, safety i deletion nie wolno z niej usuwać.

## Kolejność wykonania

```text
T+24
  → filtr tekstu + nonce fix
  → Apple revoke klient/backend
  → testy + sekrety + deploy delete-account + test urządzeniowy Sign in with Apple
  → smoke moderacji
  → konta demo + metadata
  → Archive + device smoke
  → release decision z zaakceptowanym P0-3
  → Submit for Review
```

## Rollback i zasady bezpieczeństwa

- nie przywracać fallbacku logowania bez nonce;
- brak konfiguracji Apple revoke ma blokować usunięcie konta Apple czytelnym
  błędem, a nie usuwać dane częściowo;
- nie logować authorization code, tokenów, client secret ani klucza Apple;
- awaria backendu podczas review wymaga naprawy lub wycofania buildu;
- rollback filtra tekstu nie może otworzyć ścieżki bypass; w razie krytycznej
  awarii można czasowo zablokować wysyłkę tekstu;
- nie mergować ani wdrażać elementów PR #9 jako produkcyjnego P0-3.

## Ryzyka

| Ryzyko | Mitigacja |
| --- | --- |
| Apple odrzuci brak filtrowania mediów pod 1.2 | zaakceptować jako wynik eksperymentu; zachować PR #9 i wtedy zaplanować najtańszą konkretną odpowiedź |
| Brak lub zła konfiguracja klucza Apple | DoR przed S4, test urządzeniowy Sign in with Apple, brak sekretów w kliencie |
| Revoke przejdzie, a usuwanie danych nie | idempotentny cleanup danych; retry traktuje już odwołany token jako stan zgodny |
| Usuwanie danych przejdzie przed revoke | stała kolejność revoke → cleanup → delete auth user |
| Review nie może zalogować drugiego konta | dedykowane konta, wcześniejszy clean-install rehearsal |
| Push/backend nie działa podczas review | obserwacja produkcji i właściciel dostępny w oknie review |
| Zakres urządzeń przekroczy tydzień | chronić auth/upload/safety/deletion; użyć bufora, nie obniżać krytycznego smoke |

## Definition of Done

Sprint jest zakończony, gdy:

- issue #6 jest zamknięte pozytywnym T+24;
- nonce fallback nie istnieje i ma test regresyjny;
- Apple revoke jest CODE/PRODUCTION READY; test urządzeniowy Sign in with Apple jest odroczony;
- konto email nadal usuwa się poprawnie;
- podstawowy filtr tekstu działa na backendzie i ma testy PL/EN/bypass/false-positive;
- smoke report/block/decision/removal/appeal/cleanup przeszedł;
- dwa konta demo działają na czystej instalacji;
- wszystkie placeholdery Review Information są uzupełnione w ASC;
- finalny Archive ma prawidłowy signing, production APS i wymagane capabilities;
- krytyczna macierz urządzeń przechodzi na dokładnie wybranym buildzie;
- App Privacy, rating, metadata i Review Notes odpowiadają binary;
- właściciel produktu jawnie akceptuje, że P0-3 pozostaje otwarte;
- build został wysłany do App Review, a identyfikator wersji/buildu i data
  submission zostały zapisane w audycie.

Po submission aplikacja ma status
`IN REVIEW — P0-3 RISK ACCEPTED / P0-4 DEVICE TEST DEFERRED`, nie `GO`.
Akceptacja Apple kończy eksperyment. Odrzucenie pod 1.2 uruchamia wyłącznie
minimalną poprawkę wskazaną w Resolution Center, bez automatycznego przejścia na
płatne usługi.
