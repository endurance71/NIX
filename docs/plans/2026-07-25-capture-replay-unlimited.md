# Plan wdrożenia: Capture attempt + Replay ×1 (10 min) + Unlimited view

**Dla:** Antigravity (agent wdrożeniowy)  
**Repo:** NiX (Expo SDK 57 / RN, Supabase)  
**Status produktu:** MVP w stabilizacji — native-first iOS  
**Data decyzji:** 2026-07-25  
**Źródło prawdy UI:** `docs/native-platform-guidelines.md`  
**Źródło prawdy deploy:** `docs/DEPLOY_IOS_TESTFLIGHT.md` (bez `eas build` bez jawnej prośby)

---

## 0. Cel

Domykać pętlę zaufania i UX efemeryczny bez rozcieńczania prywatności:

1. **Capture attempt** — nadawca wie o próbie zrzutu/nagrania podczas viewera.
2. **Replay ×1** — jedno ponowne odtworzenie w oknie **10 min** od pierwszego zamknięcia view.
3. **Unlimited (`0`)** — wyświetlanie bez auto-timera (zdjęcie stoi / wideo w pętli do tapnięcia). Limity **nagrania/uploadu wideo bez zmian**.

---

## 1. Decyzje produktowe (LOCKED)

| ID | Decyzja | Wartość |
|----|---------|---------|
| D1 | Powiadomienie capture | **Push + wpis systemowy w czacie 1:1** |
| D2 | Copy capture | „próba zrzutu / nagrania” — **nie** „zrobił zrzut” |
| D3 | Lokalizacja copy | **Klient + `pushCopy` (PL/EN)** — nie hardcoded emoji w `body` DB |
| D4 | Replay window | **`viewed_at + 10 minutes`** |
| D5 | Replay count | dokładnie **×1** |
| D6 | ACK viewed | w momencie **zamknięcia** slajdu (`finishCurrentSlide`), nie w połowie |
| D7 | Unlimited sentinel | `view_duration_sec = 0` |
| D8 | Unlimited default | **nie** — default zostaje `5` |
| D9 | Limity wideo (capture) | **bez zmian** (`VIDEO_TOTAL_MAX_DURATION_MS = 180s`, segmenty, 100 MB client) |
| D10 | Unlimited wideo (viewer) | `loop = true`; koniec tylko po **tap** (jak dziś `finishCurrentSlide`) |
| D11 | Badge ikony | `capture_attempt` **nie** zawyża badge (jak `message_reaction`) |
| D12 | Deep link push capture | otwiera **czat z aktorem** (odbiorcą, który próbował) |
| D13 | Kolejność PR | **A → B → C** (osobne PR / commity logiczne) |

---

## 2. Poza zakresem

- Streaki, stories, grupy, sync kontaktów
- Powiadomienie „opened” dla nadawcy (osobny feature)
- App lock / Face ID
- Google Sign-In
- Zmiana limitów nagrywania wideo
- Włączanie Sentry

---

## 3. Architektura — stan obecny (punkt startu)

| Obszar | Pliki / zachowanie dziś |
|--------|-------------------------|
| Capture guard | `src/hooks/useViewerCaptureGuard.ts` — toast + telemetria; **brak RPC** |
| Capture policy | `deny` domyślnie; listener tylko gdy `captureDenied` |
| Viewed → cleanup | `markNixViewedWithCleanup` → natychmiast `cleanup-nix` + kasowanie storage |
| Ack kolejka | `src/lib/viewedAckQueue.ts` woła `markNixViewedWithCleanup` |
| Duration | CHECK `(5,15,30,60,180)`; `src/lib/nixViewDuration.ts`; `ALLOWED_VIEW_DURATIONS` w `nixService` |
| Viewer timer | Zdjęcie: `withTiming` → `finishCurrentSlide`; wideo: `loop=false`, `onPlayToEnd` → finish |
| Chat open chip | `canOpen = received && !is_viewed && media_path` (`ChatScreenSurface`) |
| Push outbox | `push_notification_jobs` + `push-dispatch`; typy w `_shared/push.ts` |
| Text chat | `text_messages` INSERT → trigger `new_text_message` (**ryzyko double-push**) |
| Nix cleanup cron | **brak** server sweepera jak przy `cleanup-text-messages` — tylko client `flushCleanupQueue` |

---

## 4. Kolejność wdrożenia

```
PR-A  Capture attempt (push + system event)
PR-B  Replay ×1 + delayed cleanup 10 min + server sweeper
PR-C  Unlimited view_duration_sec = 0
```

Nie łączyć A+B w jednym PR — różne powierzchnie ryzyka (abuse vs media lifecycle).

---

# PR-A — Capture attempt

## A.1 Backend

### Migracja SQL

1. Rozszerz CHECK `push_notification_jobs_event_type_check` o `'capture_attempt'` (wzoruj na `20260724160000_add_message_reaction_push.sql`).
2. Dodaj do `text_messages`:
   - `metadata JSONB NULL`
   - opcjonalnie: `is_system BOOLEAN NOT NULL DEFAULT false` (preferowane — czytelniejsze niż tylko JSON)
3. RPC **`report_capture_attempt(p_nix_id UUID)`** `SECURITY DEFINER`, `SET search_path = ''`:

**Preconditiony:**
- `auth.uid()` IS NOT NULL
- nix istnieje, `receiver_id = auth.uid()`
- opcjonalnie: nix jeszcze nie `cleaned` / media nadal istotne (nie raportuj po cleanup)
- **idempotencja:** max **1 report na `nix_id`** (unikalny `event_key` lub tabela/partial unique)

**Efekty (atomowo w jednej transakcji):**
1. `INSERT push_notification_jobs`:
   - `event_type = 'capture_attempt'`
   - `recipient_id = nix.sender_id`
   - `actor_id = auth.uid()` (odbiorca / sprawca próby)
   - `entity_id = nix.id`
   - `event_key = 'capture_attempt:' || nix.id` (drugi insert → conflict / no-op)
2. Wstaw **systemową** wiadomość do `text_messages`:
   - `sender_id = auth.uid()` (aktor)
   - `receiver_id = nix.sender_id`
   - `body` = placeholder ASCII np. `capture_attempt` (UI i push **nie** pokazują raw body)
   - `metadata = {"type":"capture_attempt","nix_id":"..."}`
   - `is_system = true`
   - `expires_at = now() + 24h` (jak zwykły chat)
3. **Krytyczne:** insert systemowy **NIE** może odpalić push `new_text_message`.
   - Opcje (wybierz jedną, preferuj 1):
     1. W triggerze `enqueue_*_push`: `IF NEW.is_system THEN RETURN NEW;`
     2. Albo insert wyłącznie przez service path z `pg_trigger` disable (gorsze)

**GRANT:** `EXECUTE` tylko `authenticated`; `REVOKE` od `PUBLIC, anon`.

### Edge `push-dispatch`

- Obsłuż `capture_attempt` w `supabase/functions/push-dispatch/index.ts`
- Copy w `supabase/functions/_shared/push.ts` (+ testy `push.test.ts`):

```
PL: title "NiX", body "{actor} próbował(a) zrobić zrzut lub nagrać ekran"
EN: title "NiX", body "{actor} tried to screenshot or record the screen"
```

- `data`: `{ version: 1, type: 'capture_attempt', entityId, actorId }`
- Badge: **nie** zwiększaj unread (jak reaction / friend)
- Skip job jeśli nix już nie istnieje / para zablokowana (wzoruj na reaction skip)

### Deploy checklist (A)

- `supabase db push` / apply migracji
- `supabase functions deploy push-dispatch`
- Zaktualizuj `docs/push-notifications.md` (wiersz tabeli eventów)

## A.2 Frontend

### Serwis

- `src/services/captureAttemptService.ts` (lub metoda w istniejącym serwisie) → `supabase.rpc('report_capture_attempt', { p_nix_id })`
- Swallow duplicate / non-critical errors (nie blokuj viewera); telemetria `viewer_capture_attempt_reported`

### Hook

- `useViewerCaptureGuard(captureDenied, senderId, nixId)`:
  - W `addScreenshotListener` → fire-and-forget RPC (tylko gdy masz `nixId`)
  - Dodać detekcję **screen recording** jeśli API Expo na iOS na to pozwala (`ScreenCapture` / `isScreenCaptured` — sprawdź aktualne API `expo-screen-capture` w zainstalowanej wersji). Jeśli brak API: dokumentuj ograniczenie i zostaw screenshot-only + TODO.
  - Nadal lokalny `notifyWarning` dla odbiorcy

**Polityka `allow`:** w v1 raportuj **tylko gdy `captureDenied === true`** (spójne z obecnym listenerem). Zanotuj w PR jako follow-up produktowy.

### Chat UI

- Rozszerz model wiadomości o `is_system` / `metadata.type`
- `ChatScreenSurface`: render **system chip** (wycentrowany, secondaryLabel), **bez** Tapback / report
- i18n: `chat.systemCaptureAttempt` PL/EN w `src/locales/*/…` (wg `docs/i18n-guidelines.md`)
- Realtime: istniejąca subskrypcja `text_messages` powinna wystarczyć jeśli SELECT RLS OK

### Push routing (app)

- Handler deep link / notification response: `capture_attempt` → `/chat/[actorId]` (jak text/reaction)

## A.3 Testy A

**Auto:**
- RPC: non-receiver → error
- RPC: drugi call tego samego nix → no-op, jeden job
- Trigger: `is_system` insert → **0** jobów `new_text_message`
- `pushCopy('capture_attempt', …)` PL/EN

**Manual (2 telefony):**
- deny → screenshot → push do nadawcy + chip w czacie
- tap push → właściwy czat
- badge ikony nie rośnie od capture
- allow → brak reportu (v1)

---

# PR-B — Replay ×1 (10 min)

## B.1 Zmiana kontraktu cleanup (BREAKING vs dziś)

**Dziś:** 1. view → `is_viewed` + **natychmiast** delete storage.  
**Po:** 1. view → `is_viewed`, media **zostaje**, cleanup zaplanowany za 10 min **lub** natychmiast po replay.

## B.2 Backend

### Migracja

```sql
ALTER TABLE public.nixes
  ADD COLUMN IF NOT EXISTS is_replayed BOOLEAN NOT NULL DEFAULT false;

-- Opcjonalnie (zalecane): jawny deadline
ALTER TABLE public.nixes
  ADD COLUMN IF NOT EXISTS replay_expires_at TIMESTAMPTZ;
```

Zaktualizuj `src/types/database.types.ts` (regeneracja lub ręcznie, jak w projekcie).

### RPC (zalecane zamiast gołych UPDATE z klienta)

1. **`mark_nix_viewed_for_replay(p_nix_id UUID)`**
   - caller = receiver
   - jeśli już `is_viewed` → no-op idempotent
   - set `is_viewed=true`, `viewed_at=now()`, `status='viewed'`, `replay_expires_at=now()+interval '10 minutes'`
   - upsert `nix_cleanup_queue` z `next_attempt_at = replay_expires_at` (**bez** wołania cleanup-nix od razu)
   - **nie** usuwać storage

2. **`mark_nix_replayed(p_nix_id UUID)`**
   - caller = receiver
   - wymaga `is_viewed AND NOT is_replayed` (atomowy `UPDATE … RETURNING`)
   - set `is_replayed=true`
   - ustaw `next_attempt_at = now()` na kolejce **lub** zwróć sygnał klientowi do `cleanup-nix`
   - preferuj: RPC ustawia kolejkę na now + klient/sweeper woła cleanup

### `cleanup-nix`

- Pozwól czyścić gdy:
  - `is_replayed = true`, **lub**
  - `replay_expires_at <= now()` (lub job `next_attempt_at <= now()`), **lub**
  - legacy path bez replay columns
- Nadal: tylko `receiver_id = auth.uid()` (user JWT) / service role w sweeperze

### Server sweeper (OBOWIĄZKOWY)

Wzoruj na `20260724123000_schedule_cleanup_text_messages.sql`:

- Edge Function np. `cleanup-nix-due` (service role) **lub** rozszerzenie istniejącego `cleanup-nix` o tryb cron
- Cron co **1–2 min**: claim jobów z `nix_cleanup_queue` gdzie `next_attempt_at <= now()`, usuń storage, `status=cleaned`
- Bez tego TTL 10 min jest iluzją (zależy od otwarcia apki)

### Client path

**Rozdziel:**
- `markNixViewed` / `markNixViewedForReplay` — **bez** `requestNixCleanup`
- `markNixReplayedWithCleanup` — replay flag + cleanup
- `viewedAckQueue` → nowa funkcja (nie stary `markNixViewedWithCleanup`)

Zachowaj `markNixViewedWithCleanup` jako deprecated wrapper tylko jeśli potrzeba migracji testów — lepiej podmienić call sites.

`enqueueCleanupJob`: akceptuj `nextAttemptAt`.

`flushCleanupQueue`: nie czyść jobów z przyszłości.

## B.3 Frontend UI / stany

### Stany odbiorcy

| Stan | Warunek | UI |
|------|---------|-----|
| New | `!is_viewed` | otwieralny chip / inbox unread |
| Replay available | `is_viewed && !is_replayed && now < replay_expires_at && media_path` | „Odtwórz ponownie” / i18n |
| Gone | `is_replayed` lub `cleaned` lub po TTL | niedostępny |

### Pliki do ruszenia

- `ChatScreenSurface` — `canOpen` → uwzględnij replay
- `inboxPresentation` / `inboxThreads` / `useInboxScreen` — stan wizualny replay
- `useChatScreen` — open viewer dla replay
- `useViewerScreen` — przy wejściu: jeśli już viewed → ścieżka replay (po finish → `mark_nix_replayed` + cleanup), nie zwykły viewed-ack
- i18n klucze PL/EN

### Nadawca

- v1: po 1. view nadal `opened` (bez osobnego „replayed”) — wystarczy
- Po cleanup: istniejący `cleaned`

## B.4 Testy B

**Auto:**
- viewed nie woła storage delete
- replay atomic: drugi concurrent → fail/no-op
- flush pomija `next_attempt_at` w przyszłości
- sweeper kasuje po TTL (integration / SQL test jeśli dostępne)

**Manual:**
- otwórz → zamknij → chip replay widoczny
- drugie otwarcie → po zamknięciu zniknięcie + storage empty
- poczekaj >10 min bez replay → znika (cron)
- dwa urządzenia, jedno konto — tylko jeden replay
- offline ack queue nadal oznacza viewed bez natychmiastowego delete

## B.5 Koszt / prywatność

- Media żyje max ~10 min po view (+ jitter cron) — akceptowalne vs 24h
- Capture protection działa też na replay

---

# PR-C — Unlimited (`view_duration_sec = 0`)

## C.1 Semantyka

| | Timed (5…180) | Unlimited (0) |
|--|----------------|---------------|
| Zdjęcie | auto-dismiss po N s | stoi do **tap** |
| Wideo | play once → finish | **`loop=true`**, finish tylko **tap** |
| Nagrywanie | bez zmian | bez zmian |
| Upload size | bez zmian | bez zmian |
| Replay | jak B | jak B; zegar od **tap dismiss** |

## C.2 Backend

```sql
ALTER TABLE public.nixes DROP CONSTRAINT IF EXISTS nixes_view_duration_sec_check;
ALTER TABLE public.nixes
  ADD CONSTRAINT nixes_view_duration_sec_check
  CHECK (view_duration_sec IN (0, 5, 15, 30, 60, 180));
```

## C.3 Frontend

- `NIX_VIEW_DURATION_CHOICES = [5, 15, 30, 60, 180, 0]` (0 na końcu menu) **lub** `[0, 5, …]` — preferuj **0 na końcu** UI
- `formatNixViewDurationLabel(0)` → „Bez limitu” / “Until tap”
- `shortNixViewDurationLabel(0)` → `∞`
- `normalizeNixViewDurationSec` + `ALLOWED_VIEW_DURATIONS` w `nixService.ts`
- `PreviewDurationMenu` — nowa pozycja
- `useViewerScreen`:
  - jeśli `view_duration_sec === 0` i image → **nie** startuj `withTiming` auto-finish
  - progress bar: ukryj lub indeterminate/pulse (produktowo: ukryj timer fill)
- `ViewerNixVideo`: prop `loop={unlimited}`; gdy loop → **nie** wołaj `onPlayToEnd` jako finish (albo nie subskrybuj playToEnd)
- Tap dismiss już jest (`ViewerScreenSurface` `onPress={vm.finishCurrentSlide}`) — zachowaj

## C.4 Testy C

- insert nix z `0` przechodzi CHECK
- insert z `7` fail
- image unlimited: brak auto-advance bez tap
- video unlimited: loop, tap kończy
- timed video: bez regresji (loop false, end → next)

---

## 5. Mapa plików (orientacyjna)

### Shared / docs
- `docs/push-notifications.md`
- `docs/capture-protection.md` (sekcja report → sender)
- `docs/NiX_Documentation_v1.2.md` (view_duration + replay) — na końcu, jeśli aktualizujecie docs w tym samym torze
- `docs/cleanup-edge-function.md`

### Supabase
- `supabase/migrations/YYYYMMDDHHMMSS_capture_attempt.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_nix_replay.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_view_duration_unlimited.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_schedule_cleanup_nix_due.sql`
- `supabase/functions/push-dispatch/index.ts`
- `supabase/functions/_shared/push.ts`
- `supabase/functions/_shared/push.test.ts`
- `supabase/functions/cleanup-nix/index.ts` (+ ewentualnie nowa `cleanup-nix-due`)

### App
- `src/hooks/useViewerCaptureGuard.ts`
- `src/hooks/useViewerScreen.ts`
- `src/hooks/useChatScreen.ts`
- `src/lib/nixViewDuration.ts`
- `src/lib/viewedAckQueue.ts`
- `src/services/nixService.ts` (+ testy)
- `src/services/captureAttemptService.ts` (new)
- `src/components/ui/preview-duration-menu.tsx`
- `src/components/viewer/ViewerNixVideo.tsx`
- `src/components/viewer/ViewerScreenSurface.tsx`
- `src/components/chat/ChatScreenSurface.tsx`
- `src/lib/inboxPresentation.ts` / threads / query
- `src/types/database.types.ts`
- locale JSON PL/EN
- push notification response router (szukaj istniejącego handlera Expo Notifications)

---

## 6. Definition of Done (łącznie)

- [ ] `npm run lint` / `typecheck` / `test` PASS
- [ ] Migracje applied na staging/dev Supabase
- [ ] `push-dispatch` + cleanup sweeper wdrożone
- [ ] Manual smoke iOS (2 urządzenia) dla A i B; C na 1 urządzeniu wystarczy
- [ ] Light/dark smoke UI (chip systemowy, menu ∞, stan replay)
- [ ] Brak regresji: timed 5s photo, video once, deny capture toast lokalny
- [ ] Docs push + capture zaktualizowane
- [ ] **Bez** `eas build` / submit (chyba że user jawnie poprosi) — OTA tylko jeśli czysty JS po native-unchanged; migracje DB / Edge = deploy Supabase, nie EAS Build

---

## 7. Ryzyka i mitigacje

| Ryzyko | Mitigacja |
|--------|-----------|
| Double push (system text) | Guard `is_system` w triggerze |
| Fake capture RPC spam | 1× / nix_id + SECURITY DEFINER checks |
| iOS nie odpala listener przy full block | Copy „próba”; telemetria; test na fizycznym iPhonie |
| Media orphan >10 min | Cron sweeper 1–2 min |
| Replay race 2 devices | Atomic RPC `mark_nix_replayed` |
| Unlimited + długi signed URL TTL | Dobierz TTL signed URL ≥ długości sesji view; odśwież URL przy replay |
| Budget storage | 10 min window, nie 24h |

---

## 8. Propozycja commit messages

```
feat(push): report capture attempts to sender with system chat event

feat(nix): allow one replay within 10 minutes before cleanup

feat(viewer): add unlimited view duration with video loop
```

---

## 9. Instrukcja dla Antigravity

1. Przeczytaj ten dokument end-to-end oraz `docs/native-platform-guidelines.md`, `docs/push-notifications.md`, `docs/cleanup-edge-function.md`, `docs/capture-protection.md`.
2. Wdrażaj **tylko PR-A**, potem stop + weryfikacja; potem B; potem C.
3. Nie zmieniaj limitów nagrywania wideo.
4. Nie dodawaj Paper / vector-icons / legacy Animated.
5. Nie uruchamiaj `eas build` / `eas submit`.
6. Po każdej migracji zaktualizuj typy i testy jednostkowe w tym samym PR.
7. Przy niepewności API `expo-screen-capture` — screenshot-first, nagrywanie jako best-effort z notatką w PR.
8. Odpowiadaj / komentuj po polsku jeśli komunikujesz się z ownerem repo.

---

*Koniec planu.*
