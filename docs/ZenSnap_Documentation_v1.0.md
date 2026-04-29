# 📄 Dokumentacja Projektowa: NiX (v1.0)

**Status:** In Progress — Sprint 1  
**Lead PM:** Gemini (AI Expert)  
**Stack:** React Native Expo + Supabase  
**Ostatnia aktualizacja:** 2026-04-29

---

> [!WARNING]
> **Apple Developer Account — OCZEKUJE**
> Sign in with Apple (SWA) jest **wstrzymane** do momentu utworzenia konta Apple Developer.
> W międzyczasie auth będzie realizowany przez **Supabase Email Magic Link** (tymczasowo) lub **anonimowe sesje**.
> Po uzyskaniu konta — wdrożyć `expo-apple-authentication` zgodnie z sekcją 2.5.

---

## 1. Product Requirements Document (PRD)

### 1.1 Wizja i Cel

NiX to ultra-prywatna aplikacja do komunikacji wizualnej. Cel: dostarczenie doświadczenia efemerycznych wiadomości (Snapów) bez algorytmów, reklam, zbędnych funkcjonalności i gromadzenia danych.

### 1.2 Kluczowe Filary (Guiding Principles)

1. **Privacy-Only:** Docelowa metoda logowania to Sign in with Apple (SWA) — *wstrzymana, patrz ostrzeżenie powyżej*. Brak zbierania numerów telefonów czy e-maili.
2. **Speed-to-Camera:** Aplikacja musi być gotowa do zrobienia zdjęcia w mniej niż 1.5 sekundy od uruchomienia.
3. **True Ephemeral:** Co zostało zobaczone, musi zostać fizycznie usunięte z infrastruktury w czasie rzeczywistym.
4. **Native-First:** Maksymalne wykorzystanie natywnych komponentów iOS/Android. Zero zbędnych abstrakcji JS tam, gdzie dostępny jest odpowiednik natywny.
5. **Budget-First:** Architektura zoptymalizowana pod najniższy możliwy koszt operacyjny (Supabase Free Tier → Pro dopiero przy wzroście).

### 1.3 User Stories (Priorytet: P0)

| ID | Użytkownik | Chcę (Funkcja) | Aby (Cel) |
| :--- | :--- | :--- | :--- |
| **US.1** | Nowy | Zalogować się *(tymczasowo: Magic Link, docelowo: Apple ID)* | Szybko i bezpiecznie założyć konto. |
| **US.2** | Zalogowany | Automatycznie widzieć widok z kamery | Natychmiast uchwycić moment. |
| **US.3** | Nadawca | Wybrać odbiorcę z listy unikalnych ID | Wysłać treść do konkretnej osoby. |
| **US.4** | Odbiorca | Zobaczyć Snapa tylko raz | Mieć pewność, że treść zniknęła po zamknięciu. |

### 1.4 Wymagania Funkcjonalne

- **Auth:** *(tymczasowo)* Supabase Magic Link / OTP → *(docelowo)* Sign in with Apple.
- **Kamera:** Natywna obsługa front/back, flash, zdjęcia (v1) i wideo (v2).
- **UI:** Wyłącznie natywne komponenty — `View`, `Text`, `Pressable`, `FlatList`, `Image`. Zero zewnętrznych UI-kitów.
- **Animacje:** 144fps — patrz sekcja 2.6.
- **Messaging:** Lista kontaktów (znajomi), powiadomienia o nowej wiadomości.
- **Data Cleanup:** Automatyczny trigger usuwający pliki ze Storage i rekordy z DB.

---

## 2. Technical Design Document (TDD)

### 2.1 Architektura Systemu

| Warstwa | Technologia | Uwagi |
| :--- | :--- | :--- |
| **Frontend** | React Native (Expo SDK 52+) | Najnowszy stabilny SDK |
| **Nawigacja** | Expo Router v4 (File-based) | Native Stack — zero JS animations |
| **Stylizacja** | NativeWind v5 + Tailwind CSS v4 | Utility classes kompilowane natywnie |
| **Backend** | Supabase Free Tier | PostgreSQL, Auth, Storage, Edge Functions |
| **Powiadomienia** | Expo Notifications (EAS) | Push tylko przy nowym Snapie |
| **Animacje** | React Native Reanimated v3 | UI Thread — 144fps |

### 2.2 Filozofia: Native-First

> [!IMPORTANT]
> Każdy komponent UI musi być zbudowany z **natywnych prymitywów** React Native.
> Zakaz używania zewnętrznych komponent-bibliotek (np. React Native Paper, NativeBase, UI Kitten).

**Dozwolone:**
- `View`, `Text`, `TextInput`, `Pressable`, `TouchableOpacity`
- `FlatList`, `SectionList`, `ScrollView`
- `Image`, `ImageBackground`
- `Modal`, `ActivityIndicator`, `Switch`
- `expo-camera`, `expo-image` (natywna obsługa cache)
- `@expo/vector-icons` (SF Symbols na iOS)

**Zabronione:**
- Żadne zewnętrzne UI-kity
- `Animated` API (zastąpione przez Reanimated)
- Zbędne wrappery i HOC-i

### 2.3 Strategia Budżetowa (Budget-First)

| Usługa | Plan | Koszt | Limity |
| :--- | :--- | :--- | :--- |
| **Supabase** | Free Tier | $0/mies. | 500MB DB, 1GB Storage, 50K auth users |
| **EAS Build** | Free | $0/mies. | 30 builds/mies. |
| **EAS Update** | Free | $0/mies. | 1000 updates/mies. |
| **Apple Developer** | Standard | $99/rok | *(oczekuje na rejestrację)* |

> [!TIP]
> Supabase Free Tier wystarczy na MVP i wczesny growth. Migracja do Pro ($25/mies.) dopiero gdy:
> Storage > 800MB **lub** aktywnych użytkowników > 40K.

### 2.4 Schemat Bazy Danych (PostgreSQL)

```sql
-- 1. Profile użytkowników
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  apple_id TEXT UNIQUE,               -- NULL do czasu wdrożenia Apple Auth
  push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- 2. Tabela wiadomości (Snaps)
CREATE TABLE public.snaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) NOT NULL,
  media_path TEXT NOT NULL,           -- Ścieżka w S3 Bucket
  media_type TEXT DEFAULT 'image',
  is_viewed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ
);

-- 3. Znajomości (Relacje)
CREATE TABLE public.friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id),
  friend_id UUID REFERENCES public.profiles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  UNIQUE(user_id, friend_id)
);
```

### 2.5 Auth — Plan Wdrożenia (Dwuetapowy)

#### Etap 1 — AKTYWNY (bez Apple Dev Account)
```
Użytkownik → Supabase OTP (email/magic link) → Sesja JWT → Onboarding (username)
```
- Używamy `supabase.auth.signInWithOtp({ email })` 
- Minimalne dane — tylko email do weryfikacji tożsamości
- Email **nie jest przechowywany** w tabeli `profiles`

#### Etap 2 — PO UZYSKANIU APPLE DEV ACCOUNT ⏳
```
Użytkownik → Sign in with Apple → identityToken → supabase.auth.signInWithIdToken() → Sesja JWT
```
- Instalacja: `npx expo install expo-apple-authentication`
- Konfiguracja `app.json`: `"usesAppleSignIn": true`
- Bundle ID: `com.nix.app`
- Migracja: dodanie kolumny `apple_id` w `profiles` (już uwzględnione w schemacie)

### 2.6 Animacje — Strategia 144fps

> [!IMPORTANT]
> **Cel:** Wszystkie animacje muszą działać na wątku UI (nie JS thread), zapewniając płynność 120/144fps na ProMotion iPhone i Android 144Hz.

#### Główna biblioteka: React Native Reanimated v3

```bash
npx expo install react-native-reanimated
```

**Dlaczego Reanimated v3:**
- Działa w pełni na UI Thread (Worklet architecture)
- Pełna kompatybilność z Expo SDK 52+
- Obsługuje 120/144fps na ProMotion (iPhone 13 Pro+) i Android 144Hz
- Natywne interpolacje bez bridge'a

#### Zasady animacji w NiX:

| Zasada | Opis |
| :--- | :--- |
| `useSharedValue` | Zamiast `useState` dla wartości animowanych |
| `useAnimatedStyle` | Zamiast inline styles z Animated |
| `withSpring` / `withTiming` | Natywne krzywe animacji |
| `withDecay` | Fizyczne przewijanie (momentum) |
| **ZAKAZ** `Animated` API | Przestarzałe, działa na JS thread |
| **ZAKAZ** `LayoutAnimation` | Niekompatybilne z 144fps |

#### Biblioteki pomocnicze (jeśli Reanimated niewystarczający):

| Biblioteka | Przypadek użycia | 144fps |
| :--- | :--- | :--- |
| `react-native-gesture-handler` | Gesty (swipe, pinch) | ✅ UI Thread |
| `expo-blur` | Natywne rozmycie | ✅ Native |
| `@shopify/flash-list` | Listy wysokiej wydajności | ✅ Native |

### 2.7 Bezpieczeństwo i RLS (Row Level Security)

```sql
-- Polityka dla tabeli snaps
ALTER TABLE public.snaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Użytkownik widzi tylko swoje snaps"
  ON public.snaps FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Polityka dla tabeli profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profil widoczny dla zalogowanych"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');
```

### 2.8 Algorytm Usuwania (Zero-Waste)

```
Klient (Odbiorca)
      │
      ▼
  is_viewed: true  ──▶  Supabase Edge Function
                               │
                    ┌──────────┴───────────┐
                    ▼                      ▼
          storage.remove([path])    DELETE FROM snaps
          (media-vault bucket)      WHERE id = snap_id
```

> [!IMPORTANT]
> Edge Function musi być zabezpieczona JWT verification.

---

## 3. Struktura Projektu (Project Skeleton)

```
/src
  /api             # Supabase hooks (React Query / SWR)
  /app             # Expo Router (nawigacja)
    /(auth)        # login.tsx, onboarding.tsx
    /(tabs)        # kamera (index), wiadomości, profil
  /components      # Wyłącznie natywne komponenty
  /hooks           # useAuth, useCamera, useMediaUpload
  /lib             # supabase.ts (klient)
  /services        # notificationService, storageService
  /types           # database.types.ts
```

### 3.1 Kluczowe Pliki i Odpowiedzialności

| Plik | Odpowiedzialność |
| :--- | :--- |
| `src/lib/supabase.ts` | Inicjalizacja klienta Supabase + konfiguracja sesji |
| `src/app/(auth)/login.tsx` | *(Etap 1)* OTP login / *(Etap 2)* Sign in with Apple |
| `src/app/(auth)/onboarding.tsx` | Wybór unikalnego username (tylko przy pierwszym logowaniu) |
| `src/app/(tabs)/index.tsx` | Widok kamery (full-screen, domyślny ekran) |
| `src/hooks/useAuth.ts` | Logika auth — OTP teraz, Apple Auth po uzyskaniu konta |
| `src/hooks/useCamera.ts` | Obsługa permisji i funkcji kamery |
| `src/hooks/useMediaUpload.ts` | Upload plików do Supabase Storage |
| `src/services/storageService.ts` | Abstrakcja operacji na Supabase Storage |
| `src/services/notificationService.ts` | Obsługa push tokenów i powiadomień EAS |
| `src/types/database.types.ts` | Auto-generowane typy TypeScript ze schematu Supabase |

---

## 4. Roadmapa i Sprinty

### Sprint 1: Foundation *(Current)*

- [ ] Inicjalizacja projektu Expo Router (TypeScript)
- [ ] Konfiguracja NativeWind v5 + Tailwind CSS v4
- [ ] Konfiguracja Reanimated v3 + Gesture Handler
- [ ] Implementacja auth — Supabase OTP (etap tymczasowy)
- [ ] Ekran `login.tsx` (OTP flow)
- [ ] Ekran `onboarding.tsx` (wybór username)
- [ ] Inicjalizacja klienta Supabase (`src/lib/supabase.ts`)

### Sprint 2: Media Engine

- [ ] UI Kamery (Full screen, native)
- [ ] Logika zapisu zdjęcia i uploadu do Supabase Storage
- [ ] Wybór odbiorcy z listy kontaktów
- [ ] Animacje przejść (Reanimated v3)

### Sprint 3: Delivery & Destruction

- [ ] Ekran listy wiadomości (`FlashList`)
- [ ] Full-screen media viewer
- [ ] Implementacja Edge Function do usuwania danych

### Sprint 4: Apple Auth *(blokowane — oczekuje na Apple Dev Account)* ⏳

- [ ] Rejestracja Apple Developer Account
- [ ] Konfiguracja `expo-apple-authentication`
- [ ] Migracja flow auth z OTP → Sign in with Apple
- [ ] Testy na fizycznym urządzeniu iOS
- [ ] Przygotowanie do App Store Review

---

## 5. Zależności (Dependencies)

```bash
# Core
npx expo install expo-router
npx expo install expo-camera
npx expo install expo-image
npx expo install @supabase/supabase-js

# Animacje 144fps
npx expo install react-native-reanimated
npx expo install react-native-gesture-handler

# Listy
npm install @shopify/flash-list

# Stylizacja
npm install nativewind
npm install --save-dev tailwindcss

# Powiadomienia
npx expo install expo-notifications

# Apple Auth (WSTRZYMANE — dodać po uzyskaniu konta)
# npx expo install expo-apple-authentication
```

### `package.json` – Kluczowe Pakiety

| Pakiet | Wersja | Cel |
| :--- | :--- | :--- |
| `expo` | `~52.0.0` | Bazowy framework |
| `expo-router` | `~4.x` | File-based navigation (Native Stack) |
| `react-native-reanimated` | `^3.x` | Animacje 144fps (UI Thread) |
| `react-native-gesture-handler` | `^2.x` | Gesty natywne |
| `@shopify/flash-list` | `^1.x` | Listy wysokiej wydajności |
| `expo-camera` | `~15.x` | Dostęp do kamery |
| `expo-image` | `~2.x` | Natywna obsługa obrazów + cache |
| `@supabase/supabase-js` | `^2.x` | Klient Supabase |
| `nativewind` | `^5.x` | Tailwind CSS v4 dla RN |
| ~~`expo-apple-authentication`~~ | ~~`~6.x`~~ | ~~Sign in with Apple~~ *(wstrzymane)* |

---

## 6. Konfiguracja `app.json`

```json
{
  "expo": {
    "name": "NiX",
    "slug": "nix-app",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.nix.app",
      "usesAppleSignIn": false
    },
    "plugins": [
      "expo-router",
      [
        "expo-camera",
        {
          "cameraPermission": "NiX needs camera access to let you capture and send Snaps."
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png"
        }
      ],
      "react-native-reanimated"
    ]
  }
}
```

> [!NOTE]
> Po uzyskaniu Apple Developer Account zmienić `"usesAppleSignIn": false` na `true` i dodać plugin `"expo-apple-authentication"`.

---

## 7. Słownik Pojęć

| Termin | Definicja |
| :--- | :--- |
| **Snap** | Efemeryczna wiadomość multimedialna (zdjęcie/wideo) |
| **SWA** | Sign in with Apple — docelowa metoda autoryzacji *(wstrzymana)* |
| **OTP** | One-Time Password — tymczasowa metoda auth przez Supabase |
| **RLS** | Row Level Security — polityki dostępu na poziomie wiersza w PostgreSQL |
| **EAS** | Expo Application Services — usługi budowania i powiadomień |
| **Edge Function** | Bezserwerowa funkcja wykonywana po stronie Supabase |
| **media-vault** | Prywatny bucket Supabase Storage przechowujący media Snapów |
| **Worklet** | Funkcja Reanimated wykonywana na UI Thread (nie JS Thread) |
| **ProMotion** | Technologia Apple 120Hz/144Hz w iPhone 13 Pro+ |

---

*Dokumentacja wygenerowana: 2026-04-29 | Wersja: 1.1 | Status: In Progress — Sprint 1*
