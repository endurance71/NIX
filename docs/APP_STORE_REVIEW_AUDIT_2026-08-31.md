# NiX — audyt App Store Review (2026-08-31)

> Kanoniczny status binary: [`release/ios-current.md`](./release/ios-current.md).
> Ten dokument jest reaudytem zgodności z wytycznymi, nie zastępuje statusu wydania.

**Data:** 2026-08-31
**Skill:** `app-store-review` 1.3.0 (`safaiyeh/app-store-review-skill`)
**Podstawa:** [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) po aktualizacji z 8 czerwca 2026 (skill potwierdza aktualność na 29 sierpnia 2026), plus ogłoszenia: Social Media w age rating (obowiązkowe od września 2026)
**Binary:** `1.0.11 (5)` — Internal TestFlight only
**Werdykt:** **NO-GO** do publicznego App Review

Poprzedni snapshot: [`APP_STORE_REVIEW_AUDIT_2026-08-26.md`](./APP_STORE_REVIEW_AUDIT_2026-08-26.md). Kanon wydania: [`release/ios-current.md`](./release/ios-current.md). Ścieżka GO: [`plans/2026-09-04-shortest-path-to-moderation-go.md`](./plans/2026-09-04-shortest-path-to-moderation-go.md).

## 1. Podsumowanie

NiX ma działający rdzeń komunikatora 1:1, Sign in with Apple, usuwanie konta w aplikacji, report/block, removal, publiczny kontakt, brak IAP/reklam/trackingu i konkretne purpose strings. To nie wystarcza do submission.

Guideline **1.2** wymaga metody filtrowania objectionable material **zanim** treść zostanie opublikowana. Report, block i kontakt są spełnione. Zdjęcia i wideo nadal finalizują się bez skanu. Filtr tekstu to wąski SQL CHECK fraz. ADR-001 pozostaje **Proposed**; flaga `pre_delivery_moderation_enabled` ma default `FALSE` i na produkcji kolumny nie ma.

Najwcześniejszy kandydat publiczny: **`1.0.11 (6+)`** z tagged `main` po zamknięciu P0. Build 5 nie składać.

## 2. Werdykt według sekcji skillu

| Sekcja | Ocena | Blokada |
| --- | --- | --- |
| 1 Safety | NO-GO | 1.2 filtr mediów |
| 2 Performance | NO-GO | kompletność UGC + brak dowodów urządzeniowych / IPv6 / iPad |
| 3 Business | OK | brak zakupów w binary |
| 4 Design | OK | 4.8 Apple+email; nie WebView; push/LA statycznie OK |
| 5 Legal | WARUNKOWE | niespójne polityki; revoke bez device testu |

## 3. Macierz 1.2 (obowiązkowe cztery + removal)

| Wymóg Apple | Stan | Ocena |
| --- | --- | --- |
| Filtr objectionable material przed publikacją | media: brak; tekst: keywords SQL; Azure WIP nie na prod | **FAIL / P0** |
| Report offensive content | `report-content` v7, JWT, XOR target, evidence 30 dni | **PASS** |
| Block abusive users | `block-user` v6 + UI | **PASS** |
| Published contact | in-app mailto + `/support` | **PASS** |
| Timely response | runbook 2h/12h i 24h/72h | **MANUAL** |
| Removal + plan poprawy | `moderation_remove_reported_content` + `moderation-admin` | **PASS tooling** |

## 4. P0 — nie składać

### P0-3. Guideline 1.2 — brak filtra mediów przed doręczeniem

Kod expand/worker/Azure istnieje lokalnie (część untracked), ale:

- produkcja nie ma migracji `20260831130000` / `20260831140000`;
- `pre_delivery_moderation_enabled` default **FALSE**;
- `finalize-media-upload` tworzy NiXy bez skanu;
- klient tekstu ma fallback do bezpośredniego INSERT;
- ADR-001 = Proposed; `docs/moderation-policy.md` zakazuje enforcement;
- worker WIP skanuje wideo przez 1 thumbnail, nie baseline 1 fps z ADR.

Publiczna polityka i listing **świadomie** mówią, że zdjęć i wideo nie skanujemy. To jest zgodne z binary 5 i jednocześnie potwierdza lukę 1.2.

**Zamknięcie:** Accepted ADR po spike Azure F0 → authorized enforcement → zero doręczeń bez `approved` → aktualizacja Privacy/listing.

### P0-4. Guideline 5.1.1(v) — revoke Apple bez testu urządzeniowego

Kod: świeży `authorizationCode` → backend exchange → `revoke` → cleanup. Nonce fallback **usunięty**. Status: CODE/PRODUCTION READY, **DEVICE TEST DEFERRED**.

**Zamknięcie:** kontrolowany test Sign in with Apple na fizycznym iPhonie; dowód poza Git.

### P0-device. 2.1 / 2.4 / 2.5.5

Brak zapisanego smoke: clean install, upgrade, offline/retry, IPv6/NAT64, iPad compatibility (Review testuje iPad Air 11" M3 i iPhone 17 Pro Max), pozwolenia allow/deny.

### P0-ASC. 2.1 / 2.3 / 2.3.6

Copy w `docs/app-store-listing.md`. Wklejenie i weryfikacja w ASC (demo accounts, App Privacy, Age Rating Messaging=Yes / 16+ / not Kids, **Social Media questionnaire od września 2026**, screenshoty 6.9", telefon w formacie międzynarodowym) = MANUAL.

NiX to messaging 1:1 bez feedu — Social Media capability prawdopodobnie **No**; trzeba odpowiedzieć w kwestionariuszu, nie w category.

### P0-native. 2.5.1

React Native `0.86.2` — issue #15. Publiczny binary wymaga patched release, nie `npm audit fix --force`.

## 5. P1 — przed submission, po P0

| ID | Guideline | Finding |
| --- | --- | --- |
| P1-privacy | 5.1.1 | Trzy kanony polityki: in-app/`docs/legal` wersja `2026-08-01` („nie skanujemy prywatnych wiadomości”); hosted `/privacy` opisuje filtr fraz tekstu i brak skanu mediów. Zsynchronizować jedną treść. |
| P1-sentry | 5.1 / 2.3 | Publiczna polityka: Sentry twardo wyłączone. `eas.json` ma `EXPO_PUBLIC_SENTRY_ENABLED=true`. Potwierdzić brak DSN w production albo zaktualizować App Privacy. |
| P1-manifest | 5.1 | `PrivacyInfo.xcprivacy`: `NSPrivacyCollectedDataTypes` pusta; ASC musi deklarować Contact Info, User Content, Identifiers. |
| P1-logs | 2.1 | Brak `console.log` w `src/`; dużo `console.warn` na ścieżce uploadu bez `__DEV__` (URI tail). |
| P1-ota | 2.5.2 | `expo-updates` ALWAYS / channel `production` / runtime `1.0.11`. Review Notes: wyłącznie hotfix JS. Nie włączać feature flags OTA. |
| P1-push-jwt | 1.6 | `push-dispatch` v14 `verify_jwt=false` — issue #7. |
| P1-sla | 1.2 | Wyznaczyć właściciela dyżuru i dowód SLA. |
| P1-i18n | 4 | Część UI nadal po polsku na ścieżce EN (Live Activity, kamera, błędy). |

## 6. Zamknięte od audytu 2026-08-26

| Było | Teraz |
| --- | --- |
| P0-1 autoryzacja raportów tekstu | CLOSED (prod smoke A/B/C) |
| P0-2 retencja evidence 30 dni | CLOSED |
| P1-5 nonce fallback Apple | **naprawione** — zawsze `nonce: rawNonce`, test bez retry bez nonce |
| P0-4 revoke Apple | kod + prod function; został device test |
| Client `contentSafetyFilter.ts` | usunięty; enforcement = SQL CHECK |

## 7. Elementy OK (utrzymać)

- Brak IAP / StoreKit / RevenueCat / Stripe / reklam / krypto-płatności (3.1, 4.10)
- Email + natywny Sign in with Apple (4.8); nie WebView (4.2)
- Purpose strings kamery, mikrofonu, zdjęć — konkretne (5.1.1)
- Sesja w SecureStore; brak sekretów w `EXPO_PUBLIC_*` poza anon key
- `NSPrivacyTracking=false`; brak ATT SDK
- `expo-store-review` tylko po tapnięciu (5.6.1)
- Background modes `fetch` + `processing` = durable upload (2.5.4)
- Live Activity = postęp uploadu, nie marketing (2.5.16 / 4.5.3)
- Age gate 16+, nie Kids
- ATS: `NSAllowsArbitraryLoads=false`
- Listing bez Android/Google Play (2.3.10)
- Brak Lorem ipsum / Coming soon / TBD w product copy
- Publiczne `/privacy`, `/terms`, `/support` zwracają 200 bez logowania

## 8. Checklista skillu (skrót)

Privacy: URL działa, treść do wyrównania. Payments: N/A. Safety UGC: filtr FAIL. Performance: device/IPv6 FAIL. Design 4.8/4.2: PASS. Legal deletion: kod PASS, device FAIL.

## 9. Review Notes (binary 5 — nie składać)

Nie obiecywać automatycznego skanowania mediów, RevenueCat ani subskrypcji.

> NiX is a private 1:1 messenger for accepted friends aged 16+. Please use the two demo accounts in Review Information; they are already connected. Send a text, photo and short video from account A, then open them on account B. Safety controls are available from the message menu: Report and Block. Text messages pass a basic backend keyword filter. Photos and videos are not automatically scanned. Reports are reviewed by our moderation team, reported content can be removed from the queue, and report evidence is deleted after 30 days. Account deletion is available at Profile → Account → Delete account and includes Sign in with Apple token revocation in the backend. Push notifications and the upload Live Activity are optional. There are no purchases, subscriptions, ads or tracking in this build.

Po C3: przepisać akapit o skanowaniu zgodnie z faktycznym enforcement.

## 10. Ograniczenia

Audyt: repozytorium, publiczne URL-e, dokumentacja wydania. Bez panelu ASC, bez sekretów EAS, bez nowego testu na urządzeniu. MANUAL ≠ potwierdzony defekt. Nie jest to opinia prawna.

## 11. Źródła

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Aktualizacja 8 czerwca 2026](https://developer.apple.com/news/?id=a233fmpw)
- [Social media w age rating (lipiec 2026)](https://developer.apple.com/news/?id=tlur8uvi)
- [Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- Skill: https://github.com/safaiyeh/app-store-review-skill
