# Sprint 3 — filtrowanie treści przed doręczeniem (P0-3)

> **Rewizja cost-first, 2026-08-27.** Ten dokument rozdziela Sprint 3A
> (walidacja bez zmian bazy) od warunkowego Sprintu 3B (implementacja). Do czasu
> zamknięcia wszystkich bramek 3A zabronione są: expand SQL, zmiana finalizacji,
> odebranie insertu tekstu, klient, Privacy Policy i enforcement.

## Cel sprintu

Zablokować niedozwolony tekst, zdjęcia i wideo przed utworzeniem NiXa lub
wiadomości u odbiorcy, zapewnić bezpieczną kolejkę wyjątków do ręcznej oceny i
zamknąć P0-3 z audytu App Store Guideline 1.2 dowodem testowym i produkcyjnym.

## Zasada kosztowa

- cel na start: **0 USD miesięcznie**;
- najpierw open source i lokalne przetwarzanie, potem bezpłatny Azure F0;
- płatny tier jest osobną decyzją po pomiarze jakości, wolumenu i przychodu;
- żadnego zasobu płatnego bez właściciela billingowego, limitu i alertu;
- skan jednego assetu wykonujemy raz, niezależnie od liczby odbiorców;
- optymalizacja liczby wywołań nie może tworzyć fałszywej deklaracji „pełnego
  skanu wideo” ani obniżać pokrycia poniżej przyjętego testu bezpieczeństwa;
- wyczerpanie limitu lub awaria dostawcy zatrzymuje doręczenie fail-closed.

## Etapy i pojemność

### Sprint 3A — darmowa walidacja i decyzja

- czas: do 2 dni roboczych, kończony dopiero po bramce T+24;
- zespół: 1 deweloper + właściciel konta/billingu;
- commitment: 10 godzin;
- rezultat: zaakceptowany albo odrzucony ADR, bez zmian produkcyjnego schematu.

### Sprint 3B — implementacja warunkowa

- czas: 2 tygodnie;
- zespół: 1 deweloper;
- dostępność: 80 godzin idealnych;
- commitment: maksymalnie 58 godzin;
- bufor: 22 godziny (27,5%) na worker, jakość wideo i rollout;
- priorytet: P0-3; P0-4, P0-5, RevenueCat i issue #7 pozostają poza zakresem.

Sprint 3B nie jest committed, dopóki 3A nie spełni całego Definition of Ready.
Brak darmowego lub wystarczająco taniego rozwiązania kończy się decyzją
`NO-GO / replan`, a nie uruchomieniem płatnej usługi z założenia.

## Decyzje architektoniczne

1. Media są uploadowane do prywatnego `media-vault`, ale pozostają w kwarantannie.
   Odbiorca nie ma do nich dostępu, ponieważ nie istnieje jeszcze rekord `nixes`.
2. `finalize-media-upload` sprawdza rozmiar i MIME, zleca moderację i zwraca stan
   `moderation_pending`. Nie tworzy NiXów przed decyzją `approved`.
3. Jeden asset współdzielony dla wielu odbiorców jest skanowany dokładnie raz.
4. Osobny worker obsługuje synchroniczne zdjęcia i wideo próbkowane przez ffmpeg
   na całej osi czasu. Azure Content Safety nie ma natywnego Video API. Nie wolno
   opisywać kilku klatek jako pełnego skanu pliku. Retry muszą być idempotentne.
5. `approved` uruchamia atomowe utworzenie NiXów. `rejected` nie tworzy żadnego
   NiXa, usuwa plik i zwraca klientowi stabilny kod `CONTENT_NOT_ALLOWED`.
6. W pierwszym rolloucie wynik severity 4 jest odrzucany. Stan
   `review_required` pozostaje przyszłą możliwością i nie może zostać włączony
   bez właściciela oraz realnego SLA. Awaria lub timeout dostawcy nie może
   powodować automatycznego dopuszczenia treści.
7. Tekst przestaje korzystać z bezpośredniego klientowego `INSERT`. Nowe
   idempotentne RPC/Edge Function moderuje tekst i dopiero po `approved` zapisuje
   `text_messages`, co zapobiega ominięciu filtra przez własnego klienta API.
8. Sekrety dostawcy pozostają wyłącznie po stronie backendu. Do logów i analityki
   nie trafiają treści, miniatury, ścieżki Storage, podpisane URL-e ani surowa
   odpowiedź dostawcy.
9. Przechowujemy jedynie minimalny wynik: wersję polityki, kategorie, progi,
   decyzję, czas, liczbę prób i identyfikator operacji dostawcy. Surowe media
   podlegają istniejącej retencji oraz krótkiemu TTL kwarantanny.
10. Kill switch zatrzymuje nowe wysyłki fail-closed. Nie może przełączać systemu
    na dostarczanie bez moderacji.

## Sprint 3A — plan najbliższych kroków

| # | Historia | Kryterium akceptacji | Estymacja | Właściciel |
| --- | --- | --- | ---: | --- |
| A0 | T+24 Sprintu 2 | Issue #6 wykonane nie wcześniej niż 2026-08-28 10:41 CEST; zapisane liczby i logi, audyt zaktualizowany | 1 h | deweloper |
| A1 | Naprawa PR #9 | CI zielone; ADR, spike i plan używają jednej strategii i tych samych limitów; brak twierdzenia „full video scan” | 2 h | deweloper |
| A2 | Azure F0 | Content Safety w Sweden Central, tier F0, właściciel, sekrety poza Git, brak aktywnego płatnego S0 | 1 h | właściciel konta |
| A3 | Spike tekst/obraz | Rzeczywiste API: bezpieczny JPEG oraz tekst PL/EN; przypadki Unicode, odstępy i prosta obfuskacja; brak atrapy | 1,5 h | deweloper |
| A4 | Spike wideo na całej osi | MP4 15/60/180 s; próbki obejmują początek, środek i koniec; wysokie ryzyko w każdym z tych miejsc zostaje wykryte | 2,5 h | deweloper |
| A5 | Test optymalizacji kosztu | Porównać baseline, równomierne próbki, detekcję zmian sceny i contact sheets; zapisać recall, liczbę transakcji, czas i jakość | 1 h | deweloper |
| A6 | Decyzja ADR | `Accepted`, `Superseded` albo `Rejected`; koszt 1 zdjęcia oraz wideo 15/60/180 s; świadome `severity 4 = rejected` | 1 h | właściciel produktu |

Łącznie Sprint 3A: 10 godzin. **Żaden punkt 3B nie rozpoczyna się równolegle z
otwartym A0–A6.**

### Strategie testowane w A4–A5

1. Baseline jakości: 1 klatka/s na całej długości, czyli maksymalnie 180 klatek.
2. Równomierne próbkowanie całej osi, np. 12/24/60 klatek zależnie od długości.
3. Klatki ze zmian sceny plus obowiązkowe próbki początku, środka i końca.
4. Contact sheets grupujące kilka czytelnych klatek w jednym obrazie Azure.

Strategia 2–4 może wejść do produkcji wyłącznie wtedy, gdy kontrolowany zestaw
testowy nie pokazuje regresji względem baseline. Contact sheet musi spełniać limit
Azure 4 MB oraz zachować rozdzielczość pozwalającą modelowi ocenić każdą klatkę.

### Bramki decyzji po 3A

- **A — Azure F0 wystarcza:** jakość przechodzi, prognoza mieści się w 5000
  darmowych transakcji miesięcznie → rozpocząć 3B bez S0.
- **B — F0 za małe, ale tani worker/open source rokuje:** wykonać osobny ADR/spike
  dla lokalnego modelu; nie zaczynać expand.
- **C — brak wystarczającego rozwiązania za akceptowalny koszt:** zatrzymać P0-3,
  utrzymać App Store `NO-GO` i nie generować kosztów.

## Sprint 3B — backlog warunkowy

| # | Historia | Zakres i kryterium akceptacji | Estymacja | Zależności |
| --- | --- | --- | ---: | --- |
| B1 | Polityka i fixtures | Zatwierdzić progi z 3A, wersję polityki i bezpieczny zestaw prób | 3 h | A0–A6 |
| B2 | Expand bazy | Stany moderacji, próby/decyzje, indeks kolejki, ograniczone RPC i TTL; kompatybilność starego binary | 7 h | B1 |
| B3 | Adapter i worker | Tekst, obraz i zatwierdzona strategia ffmpeg; timeout, retry/backoff, idempotencja, deduplikacja, limit F0 | 11 h | B2 |
| B4 | Bezpieczna finalizacja | `finalize` zwraca pending; tylko approve tworzy NiXy; reject usuwa asset i nie wysyła push | 8 h | B2–B3 |
| B5 | Backendowa wysyłka tekstu | Idempotentny kontrakt pre-delivery, normalizacja Unicode; bezpośredni insert odebrany dopiero w contract | 7 h | B2–B3 |
| B6 | Klient i trwała kolejka | Pending/rejected/error, retry i restart; neutralne komunikaty PL/EN | 6 h | B4–B5 |
| B7 | Operacje moderacji | Removal, sankcja i audyt; severity 4 pozostaje reject, dopóki nie ma właściciela human review | 4 h | B2–B4 |
| B8 | Testy bezpieczeństwa | Bypass, duplikaty, out-of-order, limit F0, awaria dostawcy, wielu odbiorców, kwarantanna | 6 h | B2–B7 |
| B9 | Rollout i contract | Expand → deploy → test accounts → enforcement → obserwacja → osobny contract; aktualizacja prawna dopiero po enforcement | 6 h | B1–B8 |

Łącznie Sprint 3B: 58 godzin. Bufor: 22 godziny.

## Definition of Ready

Przed rozpoczęciem Sprintu 3B muszą istnieć:

- pozytywny T+24 Sprintu 2 i zamknięte issue #6;
- zielony, przejrzany PR #9 bez sprzeczności 3/60/180 klatek;
- konto Azure F0 i przypisany właściciel billingowy dostawcy;
- zaakceptowana decyzja ADR oraz DPA/warunki przetwarzania prywatnych treści;
- potwierdzone próbkowanie całej osi wideo oraz test początku/środka/końca;
- prognoza mieści się w F0 albo istnieje osobno zaakceptowany budżet produkcyjny;
- przykładowe odpowiedzi API dla allow/review/reject/error;
- test PL/EN i obfuskacji;
- potwierdzone `severity 4 = rejected`; human review pozostaje wyłączony.

## Krytyczna ścieżka

```text
T+24 + zielony PR #9 + Azure F0
  → spike jakości i kosztu
  → Accepted ADR
  → polityka progów
  → expand bazy
  → adapter/worker
  → finalizacja media + wysyłka tekstu
  → klient i moderator
  → testy
  → rollout produkcyjny
  → obserwacja i audyt
```

## Plan wdrożenia

### Faza 1 — expand

- dodać nowe stany bez usuwania istniejących;
- wdrożyć tabele kolejki i worker za wyłączoną flagą;
- stary binary nadal finalizuje według starego kontraktu, dopóki system nie jest
  gotowy do przełączenia;
- nie dodawać contract i restrykcyjnego CHECK w tym samym `db push`.

### Faza 2 — shadow i kalibracja

- uruchomić skan na kontrolowanych kontach testowych bez doręczania wyników do
  realnych użytkowników;
- porównać decyzje z oczekiwanym zestawem prób;
- ustawić progi z konfiguracji serwerowej, nie w kliencie;
- potwierdzić koszt i p95 osobno dla zdjęć i wideo.

Shadow mode nie może skanować produkcyjnych prywatnych treści bez zgodnej polityki
prywatności i podstawy przetwarzania.

### Faza 3 — enforcement

- włączyć enforcement dla kont testowych;
- wykonać smoke A/B/C oraz próby allow/review/reject/provider-down;
- następnie włączyć dla 100% nowych wysyłek; nie migrować historycznych mediów;
- monitorować kolejkę, czas oczekiwania, błędy i koszty.

### Faza 4 — contract

- odebrać klientowi możliwość bezpośredniego insertu `text_messages`;
- uniemożliwić przejście batcha do delivered bez `approved` dla bieżącej wersji
  polityki;
- usunąć kompatybilną ścieżkę omijającą worker dopiero po potwierdzeniu, że
  używany binary obsługuje nowe stany.

## Macierz smoke

| Przypadek | Oczekiwany wynik |
| --- | --- |
| Bezpieczne zdjęcie | approve, dokładnie jeden scan, NiX doręczony |
| Bezpieczne krótkie wideo | approve po wyniku async, NiX doręczony raz |
| Materiał testowy wysokiego ryzyka | reject przed `nixes`, brak push, obiekt usunięty |
| Wynik severity 4 | `rejected`, brak dostępu odbiorcy; `review_required` wyłączone |
| Bezpieczny tekst PL/EN | wiadomość doręczona raz |
| Tekst wysokiego ryzyka z wariantem Unicode/spacjami | reject przed insertem |
| Wielu odbiorców | jeden scan assetu, atomowe/idempotentne doręczenie |
| Powtórzony finalize/callback | ten sam wynik, brak duplikatów |
| Callback poza kolejnością | starszy wynik nie nadpisuje końcowej decyzji |
| Timeout/429/5xx dostawcy | retry/pending, nigdy allow przez błąd |
| Brak sekretu lub zły podpis callbacku | 401/500 fail-closed, brak doręczenia |
| Próba odczytu kwarantanny przez odbiorcę | brak dostępu |
| Cancel podczas skanu | brak doręczenia, bezpieczny cleanup |
| Decyzja moderatora reject/ban | usunięcie, audyt i sankcja zgodnie z SLA |

## Metryki i bramki

Minimalny dashboard bez treści użytkownika:

- liczba `pending / approved / review_required / rejected / error`;
- wiek najstarszego oczekującego zadania;
- p50/p95 czasu decyzji dla obrazu i wideo;
- retry i permanent failures według kodu technicznego;
- liczba dostarczonych rekordów bez zatwierdzonej decyzji — zawsze 0;
- liczba pushy dla odrzuconych/pending — zawsze 0;
- liczba osieroconych obiektów kwarantanny starszych niż TTL — zawsze 0;
- szacowany koszt na 1000 zdjęć i minutę wideo;
- odsetek review i reject obserwowany osobno, bez treści i identyfikatorów osób.

Bramka produkcyjna:

- wszystkie testy automatyczne zielone;
- DB lint i lokalny reset zielone;
- zero ścieżek doręczenia bez decyzji `approved`;
- smoke allow/review/reject/error przechodzi na produkcji;
- rollback/kill switch sprawdzony i pozostawia pending zamiast bypassu;
- moderator potrafi odnaleźć sprawę, podjąć decyzję, usunąć treść i zastosować
  sankcję;
- dokumentacja prawna i Review Notes opisują dokładnie wybraną technologię.

## Ryzyka i mitigacje

| Ryzyko | Mitigacja |
| --- | --- |
| Strategia nie obejmuje całej osi wideo lub ma zbyt ubogą taksonomię | twarda bramka ADR; odrzucić strategię przed implementacją |
| Wideo trwa dłużej niż obecny synchroniczny finalize | stan pending, worker async, polling/realtime i trwała kolejka klienta |
| Fałszywe pozytywy blokują prywatne, legalne treści | strefa review, wersjonowane progi, kalibracja na licencjonowanych próbach |
| Awaria dostawcy zatrzymuje wysyłkę | retry/backoff, komunikat pending, alert; nigdy fail-open |
| Podwójny callback tworzy kilka NiXów | unique constraints, idempotentne complete RPC i blokada rekordu |
| Stary binary omija nowe zasady | expand/contract oraz wymuszenie minimalnej wersji przed contract |
| Koszt skanowania wideo rośnie | skan raz na asset, limity czasu/rozmiaru, budżet i alarm kosztowy |
| Prywatne treści wyciekają do logów lub regionu bez podstawy | DPA, ograniczony region, redakcja logów, krótkie URL-e/TTL, brak raw response |
| Brak realnego dyżuru human review | fail-closed i nie włączać `review_required` produkcyjnie bez właściciela SLA |

## Definition of Done

P0-3 można oznaczyć jako `CLOSED` dopiero, gdy:

- tekst, zdjęcia i cała oś czasu wideo są filtrowane po stronie backendu przed
  doręczeniem zgodnie ze strategią zatwierdzoną w spike;
- własny klient Supabase nie potrafi ominąć moderacji;
- treści wysokiego ryzyka oraz błędy dostawcy nie tworzą `nixes` ani
  `text_messages` i nie generują push;
- bezpieczna treść jest dostarczana idempotentnie, także po retry i restarcie;
- moderator obsługuje review/removal/sankcję/appeal z audytem i zadeklarowanym SLA;
- storage quarantine i wyniki skanów mają wymuszoną retencję oraz cleanup;
- testy automatyczne i produkcyjny smoke pokrywają macierz z tego dokumentu;
- obserwacja po wdrożeniu nie pokazuje dostarczeń bez approve, starych pendingów
  ani osieroconych obiektów;
- audyt App Store ma dowody: SHA, migracje, wersje funkcji, wyniki testów,
  metryki smoke i opis operacyjnego SLA;
- publiczna polityka prywatności i Review Notes nie zawierają deklaracji szerszych
  niż faktyczne działanie systemu.

Po zamknięciu P0-3 aplikacja pozostaje `NO-GO` z powodu P0-4 i P0-5.

## Poza zakresem

- Apple token revocation (P0-4);
- konta demo, ASC, Archive i device matrix (P0-5);
- zmiana `push-dispatch verify_jwt` (issue #7);
- RevenueCat i monetyzacja;
- skanowanie historycznych treści;
- budowa rozbudowanego panelu webowego — wystarczy bezpieczny interfejs
  operacyjny rozszerzający obecne `moderation-admin`.
