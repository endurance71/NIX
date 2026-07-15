# NiX — procedura moderacji i reakcji na nadużycia

**Właściciel:** Trust & Safety / MT Hub
**Obowiązuje od:** 15 lipca 2026
**Kontakt użytkownika i eskalacji:** kontakt@damianmotylinski.pl

## Model bezpieczeństwa

NiX jest prywatnym komunikatorem pomiędzy zaakceptowanymi znajomymi. Wiadomości
nie są automatycznie skanowane. Odbiorca może przed zamknięciem wiadomości:

- zgłosić konkretną treść; wtedy kopia pliku trafia do prywatnego bucketu
  `moderation-evidence` na maksymalnie 30 dni;
- zablokować nadawcę; backend usuwa relację, ukrywa obie strony przez RLS/RPC,
  usuwa wspólne wiadomości i blokuje ponowne połączenie przez username albo QR;
- sprawdzić status własnych zgłoszeń i listę blokad w Profil → Bezpieczeństwo.

## Dyżur i SLA

| Priorytet | Przykłady | Potwierdzenie | Decyzja |
|---|---|---:|---:|
| Krytyczny | realna groźba przemocy, samookaleczenie, treść potencjalnie nielegalna | 2 godziny | 12 godzin |
| Normalny | nękanie, seksualne, hate, impersonation, spam, prywatność | 24 godziny | 72 godziny |

Dyżurny sprawdza kolejkę co najmniej rano i wieczorem. Przekroczenie SLA oraz
każdy błąd `evidence_failed` eskaluje do właściciela produktu. W bezpośrednim
zagrożeniu życia należy skontaktować się z właściwymi służbami; aplikacja nie jest
usługą ratunkową.

## Dostęp operacyjny

1. W sekretach funkcji ustaw silne, niezależne wartości `MODERATOR_API_SECRET`
   i `MODERATION_CLEANUP_SECRET`; ogranicz dostęp do dwóch upoważnionych osób.
2. Wdróż migrację `20260715095155_add_safety_moderation_and_age_gate.sql`.
3. Wdróż funkcje `report-content`, `block-user`, `moderation-admin` oraz
   `cleanup-moderation-evidence`. Nie ustawiaj `SENTRY_DSN`, dopóki obowiązuje hard-off.
4. Zaplanuj codziennie `cleanup-moderation-evidence` przez Supabase Cron/Vault.
   Wywołanie musi zawierać `x-cleanup-secret`; sekretu nie umieszczaj w SQL ani repo.
5. Przed TestFlight wykonaj zgłoszenie testowe i potwierdź, że klient nie może
   odczytać bucketu dowodowego bez funkcji administracyjnej.

Lista kolejki jest dostępna przez POST do `moderation-admin` z nagłówkiem
`x-moderator-secret` i body `{"action":"list"}`. Zwracany link do dowodu wygasa
po 10 minutach. Nie zapisuj go w komunikatorze, ticketach ani logach.

## Ocena i decyzja

1. Otwórz dowód wyłącznie na zarządzanym urządzeniu, bez pobierania lokalnej kopii.
2. Ustaw kontekst: powód, wcześniejsze aktywne akcje i pilność; nie przeglądaj
   innych prywatnych wiadomości.
3. Wybierz decyzję: `dismiss`, `warning`, `suspension` lub `ban`. Dla zawieszenia
   podaj `suspensionHours`. Body wywołania:

```json
{
  "action": "decide",
  "reportId": "UUID",
  "decision": "suspension",
  "suspensionHours": 168,
  "note": "Zwięzłe uzasadnienie bez kopiowania treści wiadomości"
}
```

4. Funkcja zapisuje decyzję i audyt. Zawieszenie/ban są natychmiast egzekwowane
   przez RPC wysyłki, listy, profile oraz zaproszenia. Jeśli decyzja dotyczy
   treści potencjalnie nielegalnej, zachowaj wyłącznie dane konieczne prawem i
   skonsultuj dalszy krok przed usunięciem.
5. O wyniku lub drodze odwoławczej odpowiedz użytkownikowi na adres kontaktowy,
   bez ujawniania danych drugiej strony.

## Odwołania i incydenty

Odwołanie obsługuje inna upoważniona osoba, jeśli jest dostępna. Wywołuje
`moderation-admin` z `action: "appeal"`, `reportId`, obowiązkową notatką i
`appealOutcome: "upheld"` albo `"action_revoked"`. Drugie rozstrzygnięcie
atomowo unieważnia aktywną akcję konta i zapisuje wynik w audit logu. Naruszenie dostępu do dowodu traktuj jako incydent
bezpieczeństwa: unieważnij sekrety, sprawdź logi, oceń obowiązek zgłoszenia i
udokumentuj działania. Co tydzień sprawdź otwarte raporty, usunięcie dowodów po
30 dniach oraz brak zewnętrznej wysyłki danych diagnostycznych.
