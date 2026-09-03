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

Cel kosztowy Sprintu 3: **0 USD miesięcznie**. Płatny tier (Azure S0 lub inny)
wymaga późniejszej, osobnej decyzji opartej na rzeczywistym użyciu i przychodzie.
Sprint 3A (10 h) nie zmienia bazy, finalizacji, insertu tekstu, klienta ani
Privacy Policy. Sprint 3B jest warunkowy i **nie** startuje, dopóki A0–A6 nie
są zamknięte.

Azure Content Safety **nie ma Video API**. Kilka klatek **nie** wolno opisywać
jako pełnego skanu pliku. Baseline jakości to 1 klatka/s na całej osi, maksymalnie
180 klatek dla klipu 180 s. Strategie 12/24/60, scene detection i contact sheets
są testami kosztu — produkcja może je przyjąć tylko bez regresji względem baseline.

T+24 Sprintu 2 ([issue #6](https://github.com/endurance71/NIX/issues/6)) **blokuje
zakończenie 3A**. Expand bazy jest zakazany do zamknięcia całego DoR 3A.

Atrapa i filtr wyłącznie na urządzeniu są zakazane.

## Decision

**Proponowany dostawca (do potwierdzenia w A6): Azure AI Content Safety, wyłącznie
tier F0**, zasób w **Sweden Central** (zapas: West Europe), API `2024-09-01`.
S0 nie jest planowanym tierem produkcyjnym. Osobna decyzja użytkownika z
2026-09-03 dopuściła jeden izolowany test S0 opłacony kredytem promocyjnym,
bez Pay-As-You-Go i bez usuwania spending limitu; zasób testowy ma być usunięty.

Powód nadrzędny: prywatne wiadomości 1:1 nie mogą iść na domyślny endpoint USA
bez rezydencji i DPA w dniu startu. Microsoft DPA jest częścią Azure Online
Services; dane nie są używane do trenowania modeli i pozostają w wybranym
regionie ([data privacy](https://learn.microsoft.com/azure/ai-services/content-safety/concepts/data-privacy)).
F0 daje 5000 transakcji/mies. przy 0 USD.

Mapowanie mediów:

| Wejście | Mechanizm |
| --- | --- |
| Tekst | `text:analyze` (Hate, SelfHarm, Sexual, Violence) + istniejący CHECK fraz jako warstwa 2, nie zamiennik |
| Zdjęcie | `image:analyze`, body base64 albo krótki signed URL; max 4 MB / 7200 px; 1 transakcja |
| Wideo | **brak natywnego Video API**. Worker / spike próbuje klatki lokalnie (ffmpeg), potem `image:analyze`. Baseline: 1 fps, max 180 klatek. Inne strategie nie są pełnym skanem, dopóki A5 nie pokaże braku regresji. |

Hive Moderation ma lepsze natywne async wideo w jednym API, ale self-serve
przetwarza w USA ([Hive Privacy](https://thehive.ai/privacy)). Rezydencja UE
jest ścieżką enterprise/sales — nie mieści się w bramce 3A bez podpisanego
kontraktu i psuje cel 0 USD.

AWS Rekognition Video skanuje pełny plik async, ale wymaga kopii prywatnego
obiektu do S3, osobnego Comprehend i płatnego użycia — poza celem kosztowym.

Open-source / lokalny model: bramka B po 3A, osobny spike, **bez expand**.

OpenAI omni-moderation: tekst+obraz, brak pełnego wideo, płatne — odrzucone jako
primary.

Sekrety tylko poza Git (ops / Vault / Edge). Logi: kategorie, severity, decyzja,
`operation_id`, liczba transakcji F0 — bez body, miniaturek, ścieżek, signed URL
i raw JSON dostawcy.

Kill switch: nowe wysyłki `fail-closed` (pending/odrzuć intake). **Zakaz**
flagi „dostarczaj bez skanu”.

Pierwszy rollout: **severity 4 = `rejected`**. Human review jest **wyłączone**.
`review_required` nie wolno włączyć bez właściciela i realnego SLA.

## Alternatives Considered

| Option | Pros | Cons | Effort |
| --- | --- | --- | --- |
| Azure AI Content Safety F0 (Sweden/WE) | Region UE, DPA od ręki, tekst+obraz, 5k txn/mies. za 0 USD, znane 0/2/4/6 | Brak Video API — nasz sampler; 4 kategorie; F0 może nie zmieścić wideo 1 fps | M |
| Azure S0 | Wyższy limit txn | Łamie cel 0 USD; wymaga osobnej decyzji po pomiarze | — (zakazane teraz) |
| Lokalny / OSS | Potencjalnie 0 USD bez limitu 5k | Osobny spike; jakość nieznana; nie zaczynać expand | Spike po bramce B |
| Hive Moderation | Jeden async API na obraz/wideo/audio/tekst | Domyślnie USA; EU = enterprise; Developer 100 req/dzień | S integracja / L prawnie |
| AWS Rekognition + Comprehend | Native `StartContentModeration` | Kopia do S3, płatne, dwa/trzy serwisy | L |
| Tylko filtr na urządzeniu / atrapa | Zero kosztu | Zakazane i niewystarczające dla 1.2 | — |
| OpenAI Moderation | Szybki tekst | Brak pełnego wideo, płatne | S (odrzucone) |

## Consequences

### Positive

- 3A da się wykonać na F0 bez płatnego zasobu.
- Jedna taksonomia i progi dla tekstu i klatek.
- Bramka A/B/C po pomiarze jakości i liczby transakcji, zanim powstanie expand.

### Negative

- Wideo to nasza robota (ffmpeg). Baseline 180 klatek zużywa 180 txn F0 na jeden
  klip 180 s — prognoza ruchu może nie zmieścić się w 5000/mies.
- 4 kategorie Azure są węższe niż Hive (brak osobnej klasy CSAM). Nie wolno
  twierdzić w Review Notes, że skanujemy „wszystkie taksonomie UGC”.
- Human review wyłączony: legalne treści severity 4 są odrzucane.

### Risks

- Jeśli spike MP4 nie wykryje high-risk na początku, środku i końcu, strategia
  odpada — nie wdrażamy enforcement.
- Jeśli F0 nie mieści prognozy i OSS nie rokuje: P0-3 zostaje NO-GO, **bez**
  uruchamiania płatnych usług.
- Shadow na prawdziwych prywatnych treściach bez podstawy i nowej Privacy
  Policy jest zakazane.

## Implementation strategy (worker; ADR still Proposed)

Spiki F0 oraz hybrydowy delta mają niezmienione historyczne dowody. Pełna
macierz C2 na izolowanym S0 w Sweden Central (2026-09-03) osiągnęła
**techniczny PASS** z czystego SHA `e75dd9df570e16b7ee40c7a3cea1b1b85af9d767`:
5 safe i 2 reject teksty, safe/reject JPEG, po 12/12 high-risk MP4 rejected
dla `baseline_1fps` i `uniform_scene_guard`, wszystkie safe severity 0.
1937 prób, bez retry i błędów providera; p95 hybrydy 180 s = 27.405 s,
5 × p95 × 1.2 = 164.429 s < 900 s. Prognoza 7/30 dni = 641 txn/miesiąc
z buforem 20%, wobec limitu operacyjnego 4000. Szacowany koszt testu:
1.450125 USD z kredytu; rozliczenie Azure jeszcze niepotwierdzone.

ADR pozostaje **Proposed** do uzgodnienia dokładnej sumy z portalu.
Po odblokowaniu Maca S0 usunięto (odświeżona grupa: zero zasobów), a Azure Home
potwierdził wstrzymanie usług po wyczerpaniu/wygaśnięciu kredytu. Ostatni
licznik portalu pozostaje opóźniony i zaokrąglony; lokalny ledger ma 1937 prób. Dowody:
`~/.nix-ops/p0-3-spike-s0/decision.md`. **Nie powtarzać live.**
Po domknięciu uruchomić `--require-complete-s0`; dopiero PASS pozwala
zaakceptować wybór dostawcy. Produkcja i C3 pozostają wyłączone.

Worker **nie** używa miniatury. Domyślna strategia runtime to `uniform`
(12/24/60 klatek + start/środek/koniec, `MODERATION_VIDEO_STRATEGY`).
`thumbnail` jest odrzucane. Sam `uniform` nie został zaakceptowany;
kandydatem po C2 jest `uniform_scene_guard`, zawsze z etykietą
`sampled_timeline_not_a_full_video_scan` i limitem 120 klatek. Zmiana
domyślnej strategii oraz runtime należy do osobnego C3. Hosted Supabase Edge nie dostarcza
ffmpeg — brak binarki kończy job jako `error`, nigdy `approved`.

Nie ustawiać `Accepted`, dopóki dowody nie mają pełnego recall
(tekst+JPEG+12×MP4: start/mid/end/scene), p95 całej decyzji wideo, prognozy z
buforem 20% ≤ 4000, czystego SHA oraz potwierdzonych metadanych zasobu bez sekretów.

## Bramka 3A (DoR historii B / expand)

Status tego ADR zostaje **Proposed**, dopóki A3–A5 nie zwrócą rzeczywistych
decyzji i liczby transakcji. A6 ustawia `Accepted`, `Superseded` albo `Rejected`.

- [ ] Issue #6 T+24 wykonane nie wcześniej niż 2026-08-28 10:41 CEST
- [ ] PR #9 zielony; jedna strategia i te same limity w ADR, spike i planie;
      brak twierdzenia „full video scan” dla strategii innych niż baseline 1 fps
- [ ] Produkcyjny zasób Content Safety Sweden Central, **sku F0**; testowy S0 usunięty
- [ ] Spike tekst PL/EN + JPEG na prawdziwym API (`scripts/moderation-provider-spike.ts`)
- [ ] Spike MP4 15/60/180 s: start/środek/koniec; porównanie baseline / uniform /
      scene / contact sheet; zapis txn vs cap 5000
- [ ] A6: Accepted tylko gdy jakość przechodzi **i** prognoza mieści się w F0
      (bramka A). Bramka B = osobny spike OSS, bez expand. Bramka C = NO-GO.
- [ ] Świadome `severity 4 = rejected`; human review wyłączone
- [ ] Właściciel billingu F0 (nawet przy 0 USD)

## Related Decisions

- [docs/plans/2026-08-27-sprint-3-pre-delivery-content-moderation.md](../plans/2026-08-27-sprint-3-pre-delivery-content-moderation.md)
- [docs/moderation-policy.md](../moderation-policy.md) — macierz `allow / reject`
- Audyt P0-3: [docs/APP_STORE_REVIEW_AUDIT_2026-08-26.md](../APP_STORE_REVIEW_AUDIT_2026-08-26.md)
- DoR: [issue #8](https://github.com/endurance71/NIX/issues/8)
- T+24 Sprint 2: [issue #6](https://github.com/endurance71/NIX/issues/6)
- CI/ADR PR: [pull/9](https://github.com/endurance71/NIX/pull/9)
