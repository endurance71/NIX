# ADR-001: Dostawca moderacji pre-delivery (P0-3)

**Date**: 2026-08-27
**Status**: Proposed
**Deciders**: właściciel produktu / jedyny deweloper (do akceptacji)

## Context

Audyt App Store (Guideline 1.2, aktualizacja 8 czerwca 2026) oznacza P0-3 jako
NO-GO: NiX ma report/block/kontakt oraz wąski filtr fraz SQL na `text_messages`,
ale **nie** filtruje zdjęć ani wideo przed doręczeniem. Klient wstawia tekst
bezpośrednio (`text_messages_insert`); `finalize-media-upload` po walidacji
MIME/rozmiaru tworzy NiXy bez skanu. Publiczna polityka wprost mówi, że
prywatnych wiadomości nie skanujemy automatycznie — to trzeba zmienić dopiero
po realnym wdrożeniu, nie wcześniej.

Sprint 3 wymaga backendowego skanu **tekstu, JPEG i pełnego pliku wideo**
(nie samej miniatury), trybu async, fail-closed, retencji wyniku bez surowej
odpowiedzi dostawcy, regionu/DPA dla prywatnych 1:1 oraz kill switch, który
**nie** przełącza na bypass.

Do końca dnia 2 (2026-08-28) muszą być: konto sandbox, credentials i
właściciel billingowy. Bez tego sprint **nie** zobowiązuje się do produkcyjnego
CLOSED P0-3. Atrapa i filtr wyłącznie na urządzeniu są zakazane.

T+24 Sprintu 2 ([issue #6](https://github.com/endurance71/NIX/issues/6)) jest
carry-overem i nie blokuje tej decyzji, ale blokuje historię 3 (expand) w DoR.

## Decision

**Proponowany dostawca: Azure AI Content Safety**, zasób w **Sweden Central**
(zapas: West Europe), API `2024-09-01`.

Powód nadrzędny: prywatne wiadomości 1:1 nie mogą iść na domyślny endpoint USA
bez rezydencji i DPA w dniu startu. Microsoft DPA jest częścią Azure Online
Services; dane nie są używane do trenowania modeli i pozostają w wybranym
regionie ([data privacy](https://learn.microsoft.com/azure/ai-services/content-safety/concepts/data-privacy)).

Mapowanie mediów:

| Wejście | Mechanizm |
| --- | --- |
| Tekst | `text:analyze` (Hate, SelfHarm, Sexual, Violence) + istniejący CHECK fraz jako warstwa 2, nie zamiennik |
| Zdjęcie | `image:analyze`, body base64 albo krótki signed URL; max 4 MB / 7200 px |
| Wideo | **nie ma natywnego Video API**. Worker pobiera MP4 z kwarantanny, próbuje klatki (1 fps, cap 60 s / 60 klatek) + opcjonalnie transkrypt audio w tym samym regionie, potem te same progi. To jest skan pełnego pliku, nie jednej miniatury uploadu. |

Hive Moderation ma lepsze natywne async wideo w jednym API, ale self-serve
przetwarza w USA ([Hive Privacy](https://thehive.ai/privacy)). Rezydencja UE
jest ścieżką enterprise/sales — nie mieści się w bramce dnia 2 bez podpisanego
kontraktu.

AWS Rekognition Video skanuje pełny plik async, ale wymaga kopii prywatnego
obiektu do S3 i osobnego Comprehend dla tekstu — za duży blast radius na 1
dewelopera.

OpenAI omni-moderation: tekst+obraz, brak pełnego wideo — odrzucone jako
primary.

Sekrety tylko w Edge/Vault. Logi: kategorie, severity, decyzja, `operation_id`,
liczba prób — bez body, miniaturek, ścieżek, signed URL i raw JSON dostawcy.

Kill switch: nowe wysyłki `fail-closed` (pending/odrzuć intake). **Zakaz**
flagi „dostarczaj bez skanu”.

## Alternatives Considered

| Option | Pros | Cons | Effort |
| --- | --- | --- | --- |
| Azure AI Content Safety (Sweden/WE) | Region UE, DPA od ręki, tekst+obraz, F0 sandbox 5k/mies., znane 0/2/4/6 | Brak Video API — nasz sampler; taksonomia 4 kategorie (bez osobnego CSAM label) | M |
| Hive Moderation | Jeden async API na obraz/wideo/audio/tekst, gęstsza taksonomia UGC | Domyślnie USA; EU residency = enterprise; 100 req/dzień na Developer | S integracja / L prawnie |
| AWS Rekognition + Comprehend | Native `StartContentModeration` na pełnym wideo, eu-central-1, DPA | Kopia do S3, dwa/trzy serwisy, więcej IAM | L |
| Tylko filtr na urządzeniu / atrapa | Zero kosztu | Zakazane przez sprint i niewystarczające dla 1.2 | — |
| OpenAI Moderation | Szybki tekst | Brak pełnego wideo | S (odrzucone) |

## Consequences

### Positive

- Da się otworzyć sandbox dziś (konto Azure + F0), bez czekania na sales Hive.
- Jedna taksonomia i progi dla tekstu, klatek i transkryptu.
- Expand/worker mogą iść na stabilnym kontrakcie JSON (`categoriesAnalysis`).

### Negative

- Wideo to nasza robota (ffmpeg/kontener albo Edge z limitem czasu). To jest
  główne zużycie bufora 20 h.
- 4 kategorie Azure są węższe niż Hive (brak osobnej klasy CSAM). Polityka
  fail-closed na Sexual/SelfHarm severity ≥ 4 częściowo to pokrywa; nie wolno
  twierdzić w Review Notes, że skanujemy „wszystkie taksonomie UGC”.

### Risks

- Sampler klatek w Edge Functions może nie zmieścić się w limicie CPU/czasu —
  wtedy osobny worker (Cloud Run / VM) albo eskalacja do Hive Enterprise UE
  **zanim** historia 4 wejdzie na produkcję. Bramka ADR: jeśli spike MP4 nie
  zwróci decyzji z ≥1 klatki/s na klipie testowym, nie wdrażamy enforcement.
- Shadow na prawdziwych prywatnych treściach bez podstawy i nowej Privacy
  Policy jest zakazane.
- `review_required` na produkcji bez właściciela SLA jest zakazane — do tego
  czasu severity 4 mapujemy na `rejected` (fail-closed).

## Bramka dnia 2 (DoR historii 3)

- [ ] Konto Azure, zasób Content Safety w Sweden Central, klucz w Vault/Edge
      (`AZURE_CONTENT_SAFETY_ENDPOINT`, `AZURE_CONTENT_SAFETY_KEY`)
- [ ] Właściciel billingowy i budżet Cost Management (proponowane $50/mies. +
      alert 80%)
- [ ] Spike JPEG + MP4: `scripts/moderation-provider-spike.mjs` exit 0
- [ ] Akceptacja tego ADR (status → Accepted) albo ADR superseding
- [ ] Właściciel kolejki human review i SLA albo świadome `review_required=off`
- [ ] T+24 issue #6 zapisane

## Related Decisions

- [docs/plans/2026-08-27-sprint-3-pre-delivery-content-moderation.md](../plans/2026-08-27-sprint-3-pre-delivery-content-moderation.md)
- [docs/moderation-policy.md](../moderation-policy.md) — macierz `allow / review / reject`
- Audyt P0-3: [docs/APP_STORE_REVIEW_AUDIT_2026-08-26.md](../APP_STORE_REVIEW_AUDIT_2026-08-26.md)
- DoR: [issue #8](https://github.com/endurance71/NIX/issues/8)
- T+24 Sprint 2: [issue #6](https://github.com/endurance71/NIX/issues/6)
