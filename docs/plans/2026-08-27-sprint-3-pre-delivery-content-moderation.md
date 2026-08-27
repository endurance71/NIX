# Sprint 3 — filtrowanie treści przed doręczeniem (P0-3)

## Cel sprintu

Zablokować niedozwolony tekst, zdjęcia i wideo przed utworzeniem NiXa lub
wiadomości u odbiorcy, zapewnić bezpieczną kolejkę wyjątków do ręcznej oceny i
zamknąć P0-3 z audytu App Store Guideline 1.2 dowodem testowym i produkcyjnym.

## Założenia i pojemność

- czas: 2 tygodnie;
- zespół: 1 deweloper;
- dostępność: 80 godzin idealnych;
- commitment: maksymalnie 60 godzin;
- bufor: 20 godzin (25%) na integrację dostawcy, asynchroniczne wideo i rollout;
- carry-over: kontrola T+24 Sprintu 2 z issue #6 (do 1 godziny);
- priorytet: P0-3; P0-4, P0-5, RevenueCat i issue #7 pozostają poza zakresem.

Jeżeli do końca drugiego dnia nie ma wybranego dostawcy, aktywnego środowiska
sandbox i testowych credentials, sprint nie może zobowiązać się do produkcyjnego
zamknięcia P0-3. Nie wolno zastąpić skanowania atrapą ani filtrem wyłącznie na
urządzeniu.

## Decyzje architektoniczne

1. Media są uploadowane do prywatnego `media-vault`, ale pozostają w kwarantannie.
   Odbiorca nie ma do nich dostępu, ponieważ nie istnieje jeszcze rekord `nixes`.
2. `finalize-media-upload` sprawdza rozmiar i MIME, zleca moderację i zwraca stan
   `moderation_pending`. Nie tworzy NiXów przed decyzją `approved`.
3. Jeden asset współdzielony dla wielu odbiorców jest skanowany dokładnie raz.
4. Osobny worker obsługuje synchroniczne zdjęcia i asynchroniczne wideo.
   Callback, polling i retry muszą być idempotentne i odporne na zdarzenia poza
   kolejnością.
5. `approved` uruchamia atomowe utworzenie NiXów. `rejected` nie tworzy żadnego
   NiXa, usuwa plik i zwraca klientowi stabilny kod `CONTENT_NOT_ALLOWED`.
6. Wynik niejednoznaczny trafia do `review_required`; do czasu decyzji człowieka
   treść nie jest doręczana. Awaria lub timeout dostawcy nie może powodować
   automatycznego dopuszczenia treści.
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

## Backlog i estymacja

| # | Historia | Zakres i kryterium akceptacji | Estymacja | Zależności |
| --- | --- | --- | ---: | --- |
| 0 | Domknięcie Sprintu 2 | Wykonać T+24 z issue #6 i zaktualizować werdykt bez rozszerzania zakresu | 1 h | czas bramki |
| 1 | ADR i wybór dostawcy | Porównać obsługę obrazu/wideo/tekstu, taksonomię, tryb async, region danych, DPA, koszt, limity, SLA i możliwość kasowania; wykonać sandbox spike dla JPEG i MP4 | 5 h | konto dostawcy |
| 2 | Polityka i fixtures | Zdefiniować wersjonowaną macierz `allow / review / reject`, kategorie wysokiego ryzyka, progi, zachowanie przy timeout i bezpieczny zestaw syntetycznych/licencjonowanych prób bez nielegalnych materiałów w Git | 4 h | historia 1 |
| 3 | Expand bazy | Dodać stany moderacji assetu/batcha, tabelę prób i decyzji, indeks kolejki, ograniczone RPC claim/complete oraz TTL kwarantanny; zachować kompatybilność starego binary | 7 h | historia 2 |
| 4 | Adapter i worker moderacji | Dodać interfejs dostawcy, skan obrazu, pełnego wideo i tekstu, timeouty, retry z backoffem, idempotencję, deduplikację i weryfikację callbacku | 11 h | historie 1–3 |
| 5 | Bezpieczna finalizacja mediów | Rozdzielić walidację uploadu od doręczenia; `finalize` zwraca pending, a approve tworzy wszystkich NiXów atomowo; reject usuwa asset i nigdy nie wysyła push | 8 h | historie 3–4 |
| 6 | Backendowa wysyłka tekstu | Zastąpić bezpośredni insert autoryzowanym, idempotentnym kontraktem pre-delivery; normalizacja Unicode/obfuskacji i wielojęzyczny skan; stary insert odebrać dopiero w contract | 7 h | historie 1–4 |
| 7 | Klient i trwała kolejka | Obsłużyć `moderation_pending`, `review_required`, `rejected`, retry i restart aplikacji; komunikat ma być neutralny, dostępny PL/EN i nie ujawniać progów filtra | 6 h | historie 5–6 |
| 8 | Ręczna ocena i removal | Rozszerzyć istniejący panel/API moderatora o kolejkę pre-delivery, approve/reject, usunięcie treści i sankcję; wszystkie decyzje mają audyt i SLA | 4 h | historie 3–5 |
| 9 | Testy bezpieczeństwa | Unit/Deno/pgTAP dla bypassów, duplikatów, callback replay, out-of-order, timeout, wielu odbiorców, blokady, braku push i braku odczytu kwarantanny | 4 h | historie 3–8 |
| 10 | Rollout i dowody | Expand → deploy → smoke → obserwacja → contract; uaktualnić runbook, Privacy Policy, review notes i audyt wyłącznie zgodnie z rzeczywistym wdrożeniem | 3 h | historie 1–9 |

Łącznie: 60 godzin. Bufor: 20 godzin.

## Definition of Ready

Przed rozpoczęciem historii 3 muszą istnieć:

- konto sandbox i przypisany właściciel billingowy dostawcy;
- zaakceptowana decyzja ADR oraz DPA/warunki przetwarzania prywatnych treści;
- potwierdzona obsługa pełnego pliku wideo, a nie tylko miniatury;
- limity kosztowe i alarm kosztowy;
- przykładowe odpowiedzi API dla allow/review/reject/error;
- ustalony właściciel ręcznej kolejki oraz realne SLA;
- wynik T+24 Sprintu 2 zapisany w issue #6.

## Krytyczna ścieżka

```text
ADR + sandbox
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
| Wynik graniczny | `review_required`, brak dostępu odbiorcy |
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
| Dostawca nie analizuje pełnego wideo lub ma zbyt ubogą taksonomię | twarda bramka ADR; odrzucić dostawcę przed implementacją |
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

- tekst, zdjęcia i pełne wideo są filtrowane po stronie backendu przed doręczeniem;
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
