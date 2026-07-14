# Dokumentacja projektowa: NiX (v1.2)

**Status:** W toku — stabilizacja MVP  
**Stack:** React Native (Expo SDK 56) + Supabase  
**Ostatnia aktualizacja:** 2026-07-14

---

> [!NOTE]
> **Sign in with Apple (iOS)** jest wdrożony natywnie (`expo-apple-authentication` + Supabase `signInWithIdToken`). Wymaga konfiguracji providera w Supabase Dashboard — patrz [apple-sign-in-setup.md](apple-sign-in-setup.md).  
> **Równolegle aktywne:** uwierzytelnianie **e-mail + hasło** (potwierdzenie e-maila, reset hasła przez deep link). Szczegóły: [auth-flow.md](auth-flow.md).

---

> [!IMPORTANT]
> **Native-first (iOS + Android)**  
> Naczelnym wyznacznikiem aplikacji są **natywne rozwiązania platform iOS i Android** (SwiftUI / Jetpack Compose przez `@expo/ui`, moduły Expo, systemowy motyw). Pełne wytyczne: [native-platform-guidelines.md](native-platform-guidelines.md).

---

## 1. Dokument wymagań produktowych (PRD)

### 1.1 Wizja i cel

NiX to ultra-prywatna aplikacja do komunikacji wizualnej. Cel: efemeryczne wiadomości wizualne (NiX / „Nix”) bez algorytmów i zbędnego gromadzenia danych poza niezbędnym backendem.

### 1.2 Kluczowe filary

1. **Prywatność:** Sign in with Apple (iOS) + Supabase Auth e-mail+hasło (e-mail wyłącznie w warstwie auth, bez kolumny e-mail w `profiles`).
2. **Speed-to-Camera:** Szybki dostęp do kamery z zakładki głównej.
3. **True Ephemeral:** Po obejrzeniu — cleanup mediów ze Storage i finalizacja cyklu życia wiadomości (status `cleaned`, kolejka retry).
4. **Native-first (naczelny wyznacznik):** Każda warstwa UI i UX jest oceniana pod kątem natywnych konwencji **iOS i Android**. Domyślnie universal `@expo/ui` (SwiftUI / Jetpack Compose), moduły Expo z mostem natywnym, systemowy motyw; RN primitives tylko tam, gdzie natywna warstwa nie wystarcza. Szczegóły: [native-platform-guidelines.md](native-platform-guidelines.md).
5. **Budget-first:** Supabase Free Tier → Pro przy wzroście.

### 1.3 User Stories (P0)

| ID | Użytkownik | Chcę | Aby |
| :--- | :--- | :--- | :--- |
| **US.1** | Nowy | Założyć konto i zalogować się *(e-mail+hasło; docelowo Apple)* | Bezpiecznie korzystać z aplikacji |
| **US.2** | Zalogowany | Widzieć kamerę jako domyślny ekran | Szybko nagrać lub zrobić zdjęcie |
| **US.3** | Nadawca | Wybrać odbiorcę z zaakceptowanych znajomych | Wysłać NiX do konkretnej osoby |
| **US.4** | Odbiorca | Zobaczyć NiX z limitem czasu i polityką capture | Treść znika po zasadach produktu |

### 1.4 Wymagania funkcjonalne

- **Uwierzytelnianie:** rejestracja i logowanie e-mail+hasło; Sign in with Apple (iOS); potwierdzenie e-maila; reset i zmiana hasła (e-mail); onboarding z jednorazowym `username`. Szczegóły: [auth-flow.md](auth-flow.md).
- **Znajomi:** wyszukiwanie po `@username`, zaproszenia, akceptacja/odrzucenie, usuwanie znajomości; zaproszenia QR (token jednorazowy). Szczegóły: [friend-invites-qr.md](friend-invites-qr.md).
- **Awatary:** zdjęcie (buckiet `avatars`, ścieżka `<uuid>/...`) **lub** pojedyncze emoji — wykluczają się wzajemnie (`profiles_avatar_exclusive`).
- **Kamera:** front/back, zoom pinch, flash, zdjęcie (tap) i wideo (przytrzymanie); segmenty do **30 s**, sumarycznie do **180 s** na jedno przytrzymanie; opcjonalne wyciszenie mikrofonu przy nagrywaniu.
- **Preview / Send-to:** wybór czasu wyświetlania u odbiorcy: **5, 15, 30, 60, 180** sekund (`view_duration_sec`); wysyłka tylko do **zaakceptowanych** znajomych.
- **Multimedia:** obrazy i wideo (`media_type`: `image` | `video`); upload wideo z retry TUS (resumable); embedded miniatura JPEG w `nixes.thumbnail_b64` dla wideo; limit rozmiaru pliku wideo po stronie klienta **100 MB** (bucket `media-vault` do **400 MB**). Szczegóły: [video-pipeline.md](video-pipeline.md).
- **Skrzynka:** wątki odebrane/wysłane, usuwanie rozmowy (`delete_my_conversation_with_peer`), kolejka cleanup przy wejściu na skrzynkę.
- **Viewer:** odtwarzanie obrazu/wideo z timerem; ochrona screenshot/nagrywania wg polityki per nadawca (domyślnie `deny`). Szczegóły: [capture-protection.md](capture-protection.md).
- **i18n:** interfejs **PL** i **EN** (`react-i18next`, zasoby w `src/lib/i18n.ts`; metadane App Store z `src/locales/*/common.json`). Szczegóły: [i18n-guidelines.md](i18n-guidelines.md).
- **Observability:** telemetria (`telemetry.ts`), opcjonalnie Sentry (`EXPO_PUBLIC_SENTRY_DSN`), logi uploadu w `upload_logs`. Szczegóły: [observability.md](observability.md).
- **Cleanup:** Edge Function `cleanup-nix` + kolejka `nix_cleanup_queue` + audit `nix_cleanup_audit`. Szczegóły: [cleanup-edge-function.md](cleanup-edge-function.md).

---

## 2. Dokument techniczny (TDD)

### 2.0 Zasada platformowa (native-first)

**Naczelnym wyznacznikiem NiX są natywne rozwiązania iOS i Android** — nie web ani generyczne UI-kity RN.

| Obszar | Zasada |
| :--- | :--- |
| UI | Universal `@expo/ui` → platform-specific `@expo/ui` → RN primitive (wyjątek) |
| Nawigacja | Expo Router + custom tabs (`expo-router/ui`, floating pill) |
| Media / hardware | Moduły Expo (`expo-camera`, `expo-video`, `expo-screen-capture`…) |
| Motyw | Systemowy light/dark na obu platformach — [theme-guidelines.md](theme-guidelines.md) |
| Testy | Smoke manualny na iOS **i** Android przed merge zmian UI |

Pełna hierarchia wyboru, antywzorce i checklista PR: [native-platform-guidelines.md](native-platform-guidelines.md).

### 2.1 Architektura systemu

| Warstwa | Technologia | Uwagi |
| :--- | :--- | :--- |
| **Frontend** | React Native 0.85 + Expo SDK 56 | iOS only (`platforms: ["ios"]` w `app.json`) |
| **Nawigacja** | Expo Router (`src/app`) | Stack + tabs; `experiments.typedRoutes`, `reactCompiler` |
| **UI** | Universal `@expo/ui` + RN primitives | `FieldGroup`, `List`, `TextInput`, `AppIcon`; komponenty w `src/components/ui` |
| **Stan sieci** | TanStack React Query v5 | Klucze w `src/lib/queryKeys.ts` |
| **Backend** | Supabase | Postgres, Auth, Storage, Edge Functions |
| **i18n** | `i18next` + `react-i18next` + `expo-localization` | |
| **Media** | `expo-camera`, `expo-video`, `expo-image`, `expo-image-manipulator`, `react-native-compressor` | |
| **Upload wideo** | `tus-js-client` + custom file reader (`expo-file-system`) | Chunki 6 MB |
| **Animacje** | Reanimated 4 + Gesture Handler | |
| **Listy** | `@shopify/flash-list` | Tam, gdzie nie użyto SwiftUI List |
| **Capture** | `expo-screen-capture` | Tylko w viewerze |
| **Monitoring** | `@sentry/react-native` + breadcrumbs telemetrii | Warunkowo przez DSN |

Pełny zestaw zależności: sekcja 5 oraz `package.json`.

### 2.2 Filozofia UI (universal `@expo/ui`)

**Native-first:** użytkownik na iOS ma widzieć UI zgodne z HIG — osiągane przez universal `@expo/ui` oraz `@expo/ui/swift-ui`.

Komponenty bazują na universal `@expo/ui` (import z root pakietu) oraz SwiftUI. Ekrany profilu i skrzynki używają natywnych list (`List`, `FieldGroup`) z osadzonymi wierszami RN przez `RNHostView`. Ikony w UI: `AppIcon` (szczegóły: §2.2.1). Przy nowych ekranach stosuj [drzewo decyzyjne](native-platform-guidelines.md#drzewo-decyzyjne-nowy-ekran--komponent) z wytycznych platformowych.

**Layout auth:** wszystkie ekrany auth (`login`, `register`, `forgot-password`, `onboarding`) — `AuthFormLayout` z pełnym `FieldGroup` jako jedynym kontenerem scrolla. Login dodaje `AuthBrandHeader` (ikona aplikacji) i sekcję credentials w `LoginScreenSurface`. Pola formularza: `useNativeState` + `AuthTextField` / `AuthSecureField` (`nativeValue`).

#### 2.2.1 Ikony (SF Symbols)

W projekcie ikony są obsługiwane natywnie za pomocą **SF Symbols** poprzez komponent `AppIcon` z `@expo/ui/swift-ui`:

```tsx
// src/theme/app-icons.ts — mapowanie ikon na nazwy SF Symbols
const APP_ICONS = {
  inbox: 'tray.fill',
};

// src/components/ui/app-icon.tsx
// Pod spodem używa Image z systemName z @expo/ui/swift-ui
<AppIcon name="inbox" size={24} color={color} />
```

Zasady:
1. Wszystkie ikony muszą być poprawnymi nazwami SF Symbols.
2. Nowe ikony należy dodawać do typu `AppIconName` oraz mapy `APP_ICONS` w `app-icons.ts`.

**Nie używać** w nowym kodzie UI:
- `@expo/vector-icons` / Ionicons.
- legacy `Icon` lub custom SVG tam, gdzie SF Symbols wystarczają.

- **Zabronione:** ogólne UI-kity (Paper, NativeBase itd.), `Animated` API (zamiast tego Reanimated), `LayoutAnimation` w ścieżkach krytycznych FPS.

### 2.3 Strategia budżetowa

| Usługa | Plan | Uwagi |
| :--- | :--- | :--- |
| Supabase | Free → Pro | Pro przy limitach storage/użytkowników |
| EAS | wg projektu | Build / Update |
| Apple Developer | Standard | Oczekuje na rejestrację |

### 2.4 Schemat bazy danych (PostgreSQL)

**Źródło prawdy:** [supabase_setup.sql](supabase_setup.sql) (idempotentny skrypt: tabele, RLS, triggery, funkcje, buckety Storage).

Skrót encji:

| Tabela / obszar | Opis |
| :--- | :--- |
| `profiles` | `id`, opcjonalny `username` (unikalny, case-insensitive), `apple_id`, `push_token`, `avatar_storage_path`, `avatar_emoji`, trigger blokady zmiany username |
| `nixes` | Wiadomość: `sender_id`, `receiver_id`, `media_path`, `media_type`, `is_viewed`, `status` (`sent`/`viewed`/`cleaned`/`cleanup_failed`), `view_duration_sec`, `playback_duration_ms`, `thumbnail_b64`, `client_upload_id`, timestamps |
| `friendships` | `pending` / `accepted`; rate limit insertów w polityce RLS |
| `friend_invites` | Jednorazowe tokeny QR (hash MD5, TTL 5 min) |
| `nix_capture_prefs` | `(owner_user_id, friend_user_id)` → `capture_policy` `deny` \| `allow` |
| `nix_cleanup_queue` | Retry cleanup po stronie odbiorcy |
| `nix_cleanup_audit` | Audit dla `service_role` (Edge Function) |
| `upload_logs` | Metryki pipeline uploadu |

Kluczowe funkcje RPC (SECURITY DEFINER, grant dla `authenticated` tam gdzie dotyczy): `can_send_nix`, `get_public_profile_by_username`, `get_public_profiles_by_ids`, `create_friend_invite`, `redeem_friend_invite`, `get_capture_policy_for_sender`, `list_accepted_friends_paginated`, `fetch_*_paginated`, `delete_my_conversation_with_peer`, `log_cleanup_audit` (service_role).

### 2.5 Auth

Aktywny przepływ: **e-mail + hasło** + deep link `nix://auth/callback` (hash/query z tokenami; `type=recovery` → reset hasła).

Plan Apple Auth pozostaje jako etap przyszły (por. ostrzeżenie na górze dokumentu).

Szczegóły kroków i edge cases: [auth-flow.md](auth-flow.md).

### 2.6 Animacje (144fps / ProMotion)

Reanimated 4 na UI thread; gesty przez `react-native-gesture-handler`. Zasady: `useSharedValue`, `useAnimatedStyle`, `withSpring` / `withTiming`; bez `Animated` API i bez `LayoutAnimation` na gorących ścieżkach.

### 2.7 Bezpieczeństwo i RLS

- **profiles:** użytkownik widzi tylko **własny** wiersz; dane publiczne innych użytkowników przez RPC.
- **nixes:** SELECT dla nadawcy/odbiorcy; INSERT z `can_send_nix`; UPDATE viewed dla odbiorcy; trigger `prevent_nix_payload_update` chroni pola treści przed mutacją (tylko status „dostawy”).
- **Storage `media-vault`:** INSERT pod ścieżką `nixes/<uid>/...`; SELECT gdy istnieje powiązany nix; DELETE **service_role** (Edge Function).
- **Storage `avatars`:** INSERT pod `<uid>/...`; SELECT dla właściciela, zaakceptowanych znajomych lub użytkowników z relacją nix.

Pełne polityki: [supabase_setup.sql](supabase_setup.sql).

### 2.8 Algorytm usuwania (cleanup)

1. Klient (odbiorca): `markNixViewed` + enqueue `nix_cleanup_queue` + natychmiastowy `invoke('cleanup-nix')`.
2. Przy błędzie: rekord w kolejce; `flushCleanupQueue` ponawia z backoffem (do ~15 min).
3. Edge Function: JWT, walidacja `receiver_id` i `media_path`, `storage.remove`, aktualizacja `nixes.status = cleaned` (lub ścieżka legacy bez kolumny `status`), wpis audit.

Szczegóły: [cleanup-edge-function.md](cleanup-edge-function.md).

### 2.9 Ochrona capture (screenshot / nagrywanie)

Domyślnie **deny** dla treści od nadawcy; wyjątek **allow** ustawiany per znajomy przez odbiorcę (`nix_capture_prefs`). Implementacja w viewerze: `expo-screen-capture`.

Szczegóły: [capture-protection.md](capture-protection.md).

### 2.10 Pipeline wideo i upload

Nagrywanie → kompresja (z fast-path dla małych plików) → ewentualnie TUS resumable → `insertNix` z `thumbnail_b64` dla wideo → viewer z pierwszą klatką z DB.

Szczegóły: [video-pipeline.md](video-pipeline.md).

### 2.11 Observability

Telemetria jako eventy + czasy trwania; produkcyjnie breadcrumbs Sentry; `upload_logs` i dashboard SQL.

Szczegóły: [observability.md](observability.md).

### 2.12 Internacjonalizacja

Szczegóły: [i18n-guidelines.md](i18n-guidelines.md).

---

## 3. Struktura projektu

```
src/
  app/                 # Expo Router
    (auth)/            # login, register, check-email, forgot/reset password, onboarding
    (tabs)/            # index (kamera), inbox/, profile/
    preview.tsx, send-to.tsx, viewer.tsx
    friend-*.tsx       # QR, invite, confirm
  api/
  components/
    ui/                # AppHost, AppIcon, auth-form-layout, settings-list, ...
    friend/            # QR card, lista zaproszeń
  context/             # VideoDraftContext
  hooks/
  lib/                 # supabase, i18n, telemetry, queryKeys, deepLink, ...
  locales/             # pliki dla app.json (metadane), np. appName
  services/            # auth, profile, friend, nix, media, avatar, capturePolicy, ...
  theme/
  types/               # database.types.ts (subset ręczny)
```

### 3.1 Kluczowe pliki

| Plik | Odpowiedzialność |
| :--- | :--- |
| `src/theme/app-icons.ts` | Mapowanie `AppIconName` → `Icon.select` (SF + Material Symbols XML) |
| `src/components/ui/app-icon.tsx` | Cienki wrapper nad universal `Icon` |
| `src/app/_layout.tsx` | Providerzy (Query, theme, toast, video draft), DeepLink, bootstrap sesji / onboarding |
| `src/lib/deepLink.ts` | Auth URL + zaproszenia znajomych → routing |
| `src/lib/supabase.ts` | Klient Supabase |
| `src/services/authService.ts` | signIn, signUp, reset, session |
| `src/services/nixService.ts` | inbox, sent, insertNix, signed URL, viewed+cleanup, kolejka |
| `src/services/mediaService.ts` | preparacja mediów, kompresja, upload, telemetria |
| `src/services/resumableUploadService.ts` | TUS dla wideo |
| `src/services/capturePolicyService.ts` | `nix_capture_prefs`, RPC `get_capture_policy_for_sender` |
| `src/app/viewer.tsx` | Odtwarzanie, timer, capture guard, cleanup |
| `supabase/functions/cleanup-nix/index.ts` | Edge Function cleanup |

---

## 4. Roadmapa i sprinty

### Sprint 1: Foundation — **zakończony**

- Expo Router, TypeScript, Reanimated, GH, Supabase client
- Auth e-mail+hasło, onboarding username
- Motyw systemowy (iOS), NativeTabs

### Sprint 2: Media Engine — **zakończony**

- Kamera zdjęcie + wideo (segmenty, limity czasu)
- Upload zdjęć i wideo (w tym TUS, miniatury)
- Preview, send-to, kompresja

### Sprint 3: Delivery, znajomi, destrukcja — **zakończony**

- Inbox (SwiftUI list), viewer, statusy nixów, cleanup + kolejka + audit
- Znajomi, zaproszenia QR, awatary
- Capture protection per znajomy; i18n PL/EN; telemetria + Sentry (opcjonalnie)
- Edge Function `cleanup-nix` w repozytorium

### Sprint 4: Apple Auth — **oczekuje na Apple Developer Account**

- `expo-apple-authentication`, provider w Supabase, migracja użytkowników (decyzja produktowa)

---

## 5. Zależności (`package.json`)

Wersje dokładne w repozytorium — kluczowe pakiety:

| Pakiet | Wersja (npm) | Cel |
| :--- | :--- | :--- |
| `expo` | ~55.0.23 | SDK |
| `expo-router` | ~55.0.14 | Nawigacja |
| `react-native` | 0.83.6 | Runtime |
| `react` | 19.2.0 | UI |
| `@supabase/supabase-js` | ^2.105.1 | Backend |
| `@tanstack/react-query` | ^5.100.7 | Cache zapytań |
| `react-native-reanimated` | 4.2.1 | Animacje |
| `react-native-gesture-handler` | ~2.30.0 | Gesty |
| `@shopify/flash-list` | 2.0.2 | Listy |
| `@expo/ui` | ~55.0.15 | SwiftUI embedded |
| `expo-camera` / `expo-video` / `expo-image` | ~55.x | Media |
| `expo-screen-capture` | ^55.0.13 | Blokada capture |
| `tus-js-client` | ^4.3.1 | Resumable upload |
| `i18next` / `react-i18next` | ^26 / ^17 | Tłumaczenia |
| `@sentry/react-native` | ~7.11.0 | Crash / breadcrumbs |

Instalacja typowa: `npx expo install <pakiet>` dla modułów Expo.

---

## 6. Konfiguracja `app.json` (skrót)

- **platforms:** `["ios"]`
- **scheme:** `nix`
- **userInterfaceStyle:** `automatic`
- **expo-router:** `root: ./src/app`
- **plugins:** m.in. `expo-localization`, `expo-camera` (+ mikrofon), `expo-image-picker`, `expo-video`, `expo-secure-store`, `react-native-compressor`, `expo-image`, `expo-audio`, `expo-asset`
- **experiments:** `typedRoutes`, `reactCompiler`
- **locales:** `pl` → `./src/locales/pl/common.json`, `en` → `./src/locales/en/common.json`

Pełny plik: [app.json](../app.json) w katalogu głównym repo.

> [!NOTE]
> `usesAppleSignIn` i plugin `expo-apple-authentication` są włączone w [`app.json`](../app.json). Logika OAuth: [`src/services/socialAuthService.ts`](../src/services/socialAuthService.ts). Konfiguracja cloud: [apple-sign-in-setup.md](apple-sign-in-setup.md).

---

## 7. Słownik pojęć

| Termin | Definicja |
| :--- | :--- |
| **NiX / Nix** | Wiadomość wizualna efemeryczna w tabeli `nixes` |
| **view_duration_sec** | Czas pokazu u odbiorcy: 5 / 15 / 30 / 60 / 180 |
| **thumbnail_b64** | Osadzona miniatura JPEG (data URL) dla wideo, ≤ ~60 KB stringa w DB |
| **client_upload_id** | Idempotencja insertu nixa przy retry uploadu |
| **capture_policy** | `deny` (domyślnie) lub `allow` screenshotów/nagrywania treści od danego znajomego |
| **TUS** | Protokół resumable uploadu dla dużych plików wideo |
| **media-vault** | Prywatny bucket na pliki nixów |
| **avatars** | Prywatny bucket na awatary (ścieżka z UUID użytkownika) |
| **RLS** | Row Level Security w Postgres |
| **Worklet** | Kod Reanimated na UI thread |

---

## 8. Baseline jakości (release readiness)

Wytyczne platformowe (native-first): [native-platform-guidelines.md](native-platform-guidelines.md).

```bash
npm run lint
npm run typecheck
npm run test
```

Smoke P0 (manualnie — rozszerzone o [development-workflow.md](development-workflow.md); **iOS** — [native-platform-guidelines.md](native-platform-guidelines.md)):

- Rejestracja → e-mail confirm → logowanie → onboarding username / istniejący użytkownik → `(tabs)`
- Reset hasła (link) → `reset-password`; zmiana hasła z profilu
- Znajomi: wyszukiwanie, zaproszenie, akceptacja; QR create/redeem
- Kamera: zdjęcie i wideo → preview → send-to → rekord `nixes`
- Inbox → viewer → `is_viewed`, cleanup, status końcowy
- Capture: domyślnie blokada; przełącznik per znajomy → allow
- i18n: przełączenie PL/EN na kluczowych ekranach

---

*Dokumentacja: 2026-05-07 | Wersja: 1.2 | NiX*
