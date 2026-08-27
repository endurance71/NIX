# Polityka moderacji pre-delivery (wersja `2026.08.27-p0`)

**Status:** Proposed — wiąże się z [ADR-001](./adr/ADR-001-pre-delivery-content-moderation-provider.md).
Nie włączać enforcement na produkcji, dopóki ADR nie jest Accepted i spike JPEG/MP4 nie przejdzie.

Źródło progów: serwer (ten dokument + kod `moderation-policy.ts`). Klient nie zna
progów i nie może ich nadpisać.

## Kategorie wysokiego ryzyka

Azure: `Hate`, `SelfHarm`, `Sexual`, `Violence`. Severity: 0 safe, 2 low, 4 medium, 6 high.

Warstwa 2 (tekst): istniejący `private.text_message_passes_safety_filter` — pozostaje
CHECK. Sam CHECK **nie** zamyka 1.2 dla mediów.

## Macierz decyzji

`maxSeverity` = maksimum po wszystkich kategoriach (dla wideo: maksimum po klatkach
i transkrypcie).

| maxSeverity | Human review włączony | Human review wyłączony (domyślnie, brak właściciela SLA) |
| --- | --- | --- |
| 0 lub 2 | `approved` | `approved` |
| 4 | `review_required` — brak doręczenia | `rejected` (`CONTENT_NOT_ALLOWED`) |
| 6 | `rejected` | `rejected` |

Timeout, 429, 5xx, brak sekretu, zły podpis callbacku, niepełna odpowiedź:
**nigdy `approved`**. Stan `moderation_pending` + retry/backoff, potem `error`
fail-closed (brak NiXa / braku insertu tekstu).

Kill switch enforcement off: nowe wysyłki nie startują (klient: pending/blocked).
Zakaz dostarczania bez decyzji `approved`.

## Fixtures (bez nielegalnych materiałów w Git)

| ID | Cel | Źródło | Oczekiwana decyzja |
| --- | --- | --- | --- |
| `azure-docs-allow` | JSON z dokumentacji Analyze Image (same 0/2) | Microsoft docs, bez pliku binarnego | `approved` jeśli max≤2 |
| `synthetic-reject-sexual-6` | Zsyntetyzowana odpowiedź API | fixture JSON w repo | `rejected` |
| `synthetic-review-violence-4` | Zsyntetyzowana odpowiedź API | fixture JSON w repo | `rejected` gdy review off; `review_required` gdy on |
| `synthetic-provider-500` | Błąd dostawcy | fixture | nie `approved` |
| `spike-safe-jpeg` | Sandbox, prawdziwy plik | operator, poza Git | `approved` |
| `spike-safe-mp4` | Sandbox, np. krótki klip licencjonowany | operator, poza Git | `approved` po klatkach |
| `spike-high-risk` | Licencjonowany zestaw testowy dostawcy / Studio | **nie commitujemy** | `rejected` przed `nixes` |

## Przykładowe odpowiedzi dostawcy (Azure `2024-09-01`)

Allow (dokumentacja Microsoft):

```json
{
  "categoriesAnalysis": [
    { "category": "Hate", "severity": 2 },
    { "category": "SelfHarm", "severity": 0 },
    { "category": "Sexual", "severity": 0 },
    { "category": "Violence", "severity": 0 }
  ]
}
```

Reject (syntetyczny, do testów mapowania):

```json
{
  "categoriesAnalysis": [
    { "category": "Hate", "severity": 0 },
    { "category": "SelfHarm", "severity": 0 },
    { "category": "Sexual", "severity": 6 },
    { "category": "Violence", "severity": 0 }
  ]
}
```

Error: HTTP 429/500 albo body bez `categoriesAnalysis` → `error` / retry, nie allow.

## Retencja wyniku

Zapisujemy: `policy_version`, kategorie z severity, decyzję, timestamp, `attempt_count`,
identyfikator operacji dostawcy. Nie zapisujemy raw body, miniaturek, ścieżek Storage
ani signed URL.

## Privacy Policy

Nie aktualizować publicznych stron, dopóki enforcement nie działa na produkcji.
Obecny tekst („nie skanujemy automatycznie”) pozostaje prawdziwy do Fazy 3.
