# NiX — procedura moderacji i reakcji na nadużycia

**Właściciel:** Trust & Safety / MT Hub
**Obowiązuje od:** 26 sierpnia 2026
**Kontakt użytkownika i eskalacji:** kontakt@damianmotylinski.pl

## Model bezpieczeństwa

NiX jest prywatnym komunikatorem pomiędzy zaakceptowanymi znajomymi.

- Odbiorca może zgłosić konkretną treść albo użytkownika. Raport tekstowy
  tworzy wyłącznie `receiver_id`; nadawca nie zgłasza własnej wysłanej
  wiadomości. Atomowy RPC `create_content_report_v2` ustala
  `reported_user_id` z `sender_id` i wymaga dokładnie jednego celu: NiX,
  wiadomość tekstowa albo użytkownik.
- Kopia dowodu (JSON tekstu albo plik media) trafia do prywatnego bucketu
  `moderation-evidence` i ma `evidence_expires_at = created_at + 30 days`.
  Raport użytkownika bez treści nie tworzy pliku i nie wymaga daty retencji.
- Zablokować nadawcę; backend usuwa relację, ukrywa obie strony przez RLS/RPC,
  usuwa wspólne wiadomości i blokuje ponowne połączenie przez username albo QR.
- Sprawdzić status własnych zgłoszeń i listę blokad w Profil → Bezpieczeństwo.

Nie przywracać podatnego przepływu v1 (`create_content_report` +
`service_role` odczyt `text_messages` przed autoryzacją). Awaria v2:
ustawić `TEXT_REPORTS_ENABLED = false` w
`supabase/functions/report-content/contract.ts` (fail-closed dla tekstu;
raporty NiX/użytkownika zostają).

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
3. Wdróż **tylko** expand
   `20260826120000_content_report_text_target_and_evidence_retention.sql`.
   Expand **nie** zawiera CHECK `evidence_path ⇒ evidence_expires_at` ani dropu
   v1 — dzięki temu stary `report-content` w oknie expand→Edge nie zostawia
   sierot Storage.
4. Wdróż funkcje `report-content`, `block-user`, `moderation-admin` oraz
   `cleanup-moderation-evidence`. Nie ustawiaj `SENTRY_DSN`, dopóki obowiązuje hard-off.
5. Smoke A/B/C (sekcja poniżej), potem dry-run cleanupu
   (`{"dryRun":true}` / `x-dry-run: true`). Cleanup kasuje max 200 sierot
   na przebieg (najstarsze pierwsze).
6. **Osobny PR / osobna migracja contract** dopiero po powyższych krokach —
   szkic: [docs/plans/2026-08-26-content-report-contract-followup.md](./plans/2026-08-26-content-report-contract-followup.md)
   (re-backfill → CHECK → drop v1). Nie trzymać pliku contract w tym samym
   `db push` co expand.
7. Zaplanuj codziennie `cleanup-moderation-evidence` przez Supabase Cron/Vault.
   Wywołanie musi zawierać `x-cleanup-secret`; sekretu nie umieszczaj w SQL ani repo.
   Produkcyjny cleanup z kasowaniem uruchamiaj dopiero po pozytywnym dry-run.
8. Przed TestFlight wykonaj zgłoszenie testowe i potwierdź, że klient nie może
   odczytać bucketu dowodowego bez funkcji administracyjnej.

Lista kolejki jest dostępna przez POST do `moderation-admin` z nagłówkiem
`x-moderator-secret` i body `{"action":"list"}`. Zwracany link do dowodu wygasa
po 10 minutach. Nie zapisuj go w komunikatorze, ticketach ani logach.

## Smoke A/B/C

Trzy konta, A i B są zaakceptowanymi znajomymi. C nie jest odbiorcą A→B.

1. B zgłasza wiadomość tekstową A→B. Oczekiwane: 200, `{ ok, reportId }`,
   `reported_user_id = A`, `text_message_id` ustawione, `evidence_expires_at`
   za około 30 dni, jeden obiekt `{reportId}/evidence.json`.
2. A zgłasza tę samą wiadomość A→B. Oczekiwane: 403, zero nowych raportów
   i obiektów Storage.
3. C zgłasza UUID wiadomości A→B. Oczekiwane: 403, zero raportów i obiektów.
4. B ponawia to samo zgłoszenie. Oczekiwane: ten sam `reportId`, bez drugiego
   pliku dowodu.
5. B zgłasza użytkownika A bez treści. Oczekiwane: raport bez
   `evidence_expires_at`.
6. Payload `nixId + textMessageId` oraz zły legacy `reportedUserId` przy
   tekście: 400.

## Cleanup i dry-run

Przed kasowaniem na produkcji wywołaj cleanup z `{"dryRun":true}` albo
nagłówkiem `x-dry-run: true`. Funkcja porównuje obiekty bucketu
`moderation-evidence` z `content_reports.evidence_path` i **nic nie usuwa**.

Po pozytywnym dry-run i smoke:

- przeterminowane dowody: usuń obiekt, wyzeruj `evidence_path`, ustaw
  `evidence_deleted_at`;
- sieroty bez referencji i starsze niż 24 godziny: usuń obiekt;
- sieroty młodsze niż 24 godziny pozostaw (w toku uploadu).

## Monitoring

Sentry funkcji jest hard-off. Codziennie (albo `npm run check:moderation-evidence-integrity`
z `SUPABASE_DB_URL`) sprawdź:

```sql
-- musi być 0
SELECT COUNT(*) FROM public.content_reports
WHERE evidence_path IS NOT NULL AND evidence_expires_at IS NULL;

-- przeterminowane z plikiem (oczekuj 0 po cronie)
SELECT COUNT(*) FROM public.content_reports
WHERE evidence_path IS NOT NULL
  AND evidence_deleted_at IS NULL
  AND evidence_expires_at <= NOW();

SELECT COUNT(*) FROM public.content_reports WHERE status = 'evidence_failed';

SELECT COUNT(*) FROM storage.objects o
WHERE o.bucket_id = 'moderation-evidence'
  AND o.created_at < NOW() - INTERVAL '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM public.content_reports r WHERE r.evidence_path = o.name
  );
```

Przez minimum 24 godziny po wdrożeniu obserwuj 403/500 na `report-content`,
`evidence_failed`, brak expiry i opóźniony cleanup. Nie eksportuj treści
dowodów. Przed migracją zapisz wyłącznie liczby raportów, dowodów bez expiry
i obiektów Storage.

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
