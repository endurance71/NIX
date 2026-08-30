# Plan poprawek React Doctor dla Cursor

## Cel

Usuń potwierdzone i bezpieczne do naprawienia diagnostyki React Doctor, popraw ostrzeżenie konfiguracji Vitest i przywróć działające skrypty kontrolne. Nie zmieniaj zachowania produkcyjnego wyłącznie po to, aby podnieść wynik skanera.

Punktem odniesienia jest pełny skan wykonany React Doctor `0.9.12`:

- zakres: cały projekt `nix`, Expo, 403/403 plików;
- wynik: 83/100;
- 0 błędów, 11 ostrzeżeń w 5 plikach;
- 9/11 wystąpień znajduje się w testach;
- osobny skan `design`: 1 ostrzeżenie dotyczące czystej czerni;
- brak pominiętych kontroli;
- TypeScript, ESLint, Vitest i Deno przechodzą.

## Zasady pracy

1. Zachowaj wszystkie istniejące zmiany użytkownika. W szczególności nie modyfikuj ani nie cofaj obecnego diffu w `ios/`.
2. Pracuj w bieżącym drzewie roboczym, pozostaw zmiany niezatwierdzone. Nie twórz brancha, commita ani PR.
3. Używaj lokalnie przypiętego `react-doctor` 0.9.12 przez `./node_modules/.bin/react-doctor`, aby wyniki przed i po były porównywalne.
4. Nie dodawaj zależności i nie wykonuj aktualizacji major.
5. Nie uruchamiaj `eas build`, `eas submit`, prebuild ani żadnego wdrożenia.
6. Nie modyfikuj UI ani kolorów bez osobnej zgody projektowej. Projekt jest iOS-only i obowiązują `.cursor/rules/native-platform-first.mdc` oraz `docs/native-platform-guidelines.md`.
7. Nie równoleglij produkcyjnych operacji sieciowych bez zachowania limitów usługi, kolejności efektów ubocznych i semantyki błędów.
8. Po każdym etapie sprawdź diff. Nie używaj `git restore`, `git checkout --`, `git reset`, `git add .` ani `git add -A`.

## Etap 0 — baseline

Przed edycją zapisz wyniki i kody wyjścia:

```bash
git status --short
npm run typecheck
npm run lint
npm test
npm run deno:check
npm run deno:test
./node_modules/.bin/react-doctor . --json --blocking none --yes --scope full
./node_modules/.bin/react-doctor design . --json --blocking none --yes --scope full
```

Oczekiwany baseline testów:

- Vitest: 72 pliki i 398 testów;
- Deno: 44 testy;
- pełny React Doctor: 11 ostrzeżeń, wynik 83;
- design: 1 ostrzeżenie.

Jeżeli baseline różni się z powodu nowych zmian, zatrzymaj się i najpierw zaktualizuj manifest diagnostyk. Nie przypisuj wcześniejszych błędów tej pracy.

## Etap 1 — bezpieczne usprawnienia testów Deno

### 1.1 Równoległe przygotowanie dwóch niezależnych JWT

Plik: `supabase/functions/delete-account/apple_test.ts`, test `odrzuca id_token z obcym podpisem`.

- Uruchom tworzenie tokenu testowego i obcego zestawu kluczy przez jedno `Promise.all`.
- Zachowaj identyczne claims, `kid`, token przekazywany do weryfikacji i obce `jwks`.
- Nie zmieniaj kodu produkcyjnego `apple.ts`.
- Przed i po zmianie uruchom test filtrowany kilka razy. Zostaw zmianę tylko wtedy, gdy nie powoduje flakiness i nie pogarsza mediany czasu.

Przykładowy kształt, do dopasowania do istniejących nazw:

```ts
const [{ token }, other] = await Promise.all([
  generateRs256Jwt(claims),
  generateRs256Jwt(claims),
]);
```

### 1.2 Równoległe niezależne przypadki błędów

Plik: `supabase/functions/delete-account/handler_test.ts`, test `żadna ścieżka błędu przed revoke nie uruchamia cleanupu`.

- Zastąp sekwencyjną pętlę konstrukcją `await Promise.all(cases.map(async (...) => ...))`.
- Każdy przypadek ma własne `deps` i `calls`; nie współdziel mutowalnego stanu między przypadkami.
- Po otrzymaniu odpowiedzi zbuduj jeden `Set` z `calls` i użyj `.has()` do pięciu asercji członkostwa.
- Zachowaj wszystkie obecne asercje i ich znaczenie bezpieczeństwa.

### 1.3 Równoległe niezależne przypadki timeoutu

W tym samym pliku, test `timeout każdego endpointu Apple nie uruchamia cleanupu`:

- Wykonaj elementy `endpoints` przez `await Promise.all(endpoints.map(async (...) => ...))`.
- Każda iteracja nadal musi tworzyć własne `deps` i `calls`.
- Zachowaj nazwę endpointu w komunikatach asercji.
- Nie zmieniaj wartości `timeoutMs` ani produkcyjnej implementacji timeoutów.

### 1.4 Set dla dużej listy ścieżek

Plik: `supabase/functions/delete-account/storage_test.ts`, test `cleanup kasuje wyłącznie własny prefiks i ignoruje ścieżki odbiorcy`.

- Utwórz `const receivedPathSet = new Set(receivedPaths)` przed asercją.
- Zastąp `receivedPaths.includes(path)` przez `receivedPathSet.has(path)`.
- Nie zmieniaj liczby 1001 elementów — test nadal ma sprawdzać zachowanie ponad granicą strony.

### Walidacja etapu 1

```bash
npm run deno:test
npm run deno:check
./node_modules/.bin/react-doctor . --json --blocking none --yes --scope full
```

Oczekiwane zniknięcie diagnostyk:

- `server-sequential-independent-await` w `apple_test.ts`;
- oba `async-await-in-loop` w `handler_test.ts`;
- pięć wystąpień `js-set-map-lookups` w `handler_test.ts`;
- `js-set-map-lookups` w `storage_test.ts`.

## Etap 2 — produkcyjny kod Edge Functions

### 2.1 Jednoprzebiegowe podsumowanie orphanów

Plik: `supabase/functions/cleanup-moderation-evidence/contract.ts`.

- Zastąp `rows.filter(...).map(...)` prostą, czytelną pętlą budującą `eligibleNames`.
- Zachowaj dokładnie wartości `orphanCount`, `eligibleOrphanCount`, `skippedYoungOrphanCount` i kolejność `eligibleNames`.
- Nie przedstawiaj tej zmiany jako istotnego przyspieszenia produkcji: funkcja SQL `list_moderation_evidence_orphans()` ogranicza wynik do 200 rekordów.
- Traktuj zmianę jako lokalne usunięcie zbędnej alokacji i ujednolicenie skanu, nie jako naprawę realnego bottlenecku.

Walidacja:

```bash
npx -y deno test --min-dep-age=0 --lock=deno.lock supabase/functions/cleanup-moderation-evidence/contract_test.ts
npm run deno:check
```

### 2.2 Celowo sekwencyjne usuwanie Storage

Plik: `supabase/functions/delete-account/storage.ts`, funkcja `removeStoragePaths`.

Nie zamieniaj pętli na nieograniczone `Promise.all`.

Powody:

- wywołania usuwają partie do 1000 obiektów z zewnętrznej usługi;
- sekwencyjność ogranicza presję na Supabase Storage;
- obecna implementacja jest fail-fast i nie rozpoczyna późniejszych partii po błędzie;
- równoleglenie zmieniłoby semantykę częściowego niepowodzenia podczas usuwania konta.

Dodaj test kontraktowy potwierdzający, że po błędzie pierwszej partii druga partia nie jest wywoływana. Następnie dodaj w `doctor.config.ts` wąski, opisany wyjątek dla:

```text
files: ['supabase/functions/delete-account/storage.ts']
rules: ['react-doctor/async-await-in-loop']
```

Komentarz przy wyjątku ma opisywać limit partii, fail-fast oraz ochronę zewnętrznej usługi. Jest to udokumentowana decyzja operacyjna, nie wyciszenie w celu sztucznego podniesienia wyniku.

Nie implementuj ograniczonej współbieżności bez rzeczywistych metryk produkcyjnych: liczby partii na konto, czasu `storage.remove`, odsetka błędów i limitów Supabase.

## Etap 3 — ostrzeżenie Vitest/Vite

Plik: `vitest.config.ts`.

- Najpierw wyszukaj wszystkie odwołania do nazwy pliku.
- Zmień nazwę konfiguracji na `vitest.config.mts`, aby jawnie oznaczyć ESM.
- Nie dodawaj `"type": "module"` do całego `package.json`, ponieważ miałoby to szerszy wpływ na skrypty i konfiguracje CommonJS.
- Uruchom `npm test` i potwierdź, że ostrzeżenie o ESM ładowanym jako CommonJS zniknęło.
- Jeżeli Vitest nie rozpoznaje `.mts` albo ostrzeżenie pozostaje, cofnij wyłącznie własną zmianę nazwy i opisz wynik zamiast wprowadzać globalną zmianę modułów.

## Etap 4 — działające bramki React Doctor

Plik: `package.json`.

Obecne skrypty `doctor:react:ci` i `doctor:react:changed` tylko wypisują komunikat o pominięciu, mimo że dokumentacja release wymaga ich uruchamiania.

Po uzyskaniu stabilnego skanu ustaw:

```json
"doctor:react:ci": "react-doctor . --verbose --blocking error --yes --no-score",
"doctor:react:changed": "react-doctor . --verbose --scope changed --include-untracked --blocking error --yes --no-score"
```

Wymagania:

- korzystaj z lokalnej wersji z `devDependencies`;
- błędy mają blokować, ostrzeżenia mają być widoczne, ale nie blokować;
- skrypt `doctor:react:changed` musi przyjmować dodatkowe argumenty, np. `-- --base main`;
- nie modyfikuj lockfile, ponieważ zależność już istnieje.

Sprawdź:

```bash
npm run doctor:react:ci
npm run doctor:react:changed -- --base HEAD
```

## Etap 5 — świadoma decyzja designowa

Diagnostyka: `react-doctor/no-pure-black-background` w `src/app/_layout.tsx`.

Nie zmieniaj jej w tym zadaniu.

Czysta czerń ekranu bootstrap jest spójna z:

- `app.json` → splash `backgroundColor: #000000`;
- ciemnym tokenem `darkColors.background`;
- czarnym tłem ekranów kamery, preview i viewer;
- natywnym, iOS-first kierunkiem projektu.

Jest to sugestia creative-direction, a nie potwierdzony defekt. Zmiana wymaga osobnego review na iOS: splash → bootstrap, light/dark, ekran OLED i brak błysku podczas przejścia. Nie dodawaj wyjątku tylko po to, aby wyzerować osobny skan design.

## Etap 6 — dokumentacja baseline

Po zakończeniu zaktualizuj `docs/react-doctor-baseline.md`:

- dopisz datę, wersję skanera 0.9.12, zakres full i liczbę analizowanych plików;
- zapisz wynik raportowany przez skaner, a nie wynik liczony ręcznie;
- rozdziel wynik skanu ogólnego od skanu `design`;
- opisz celowo zachowaną decyzję o czarnym tle;
- popraw nieaktualne nazwy skryptów tylko wtedy, gdy potwierdzisz ich obecne odpowiedniki w `package.json`.

Nie usuwaj historycznych wpisów baseline.

## Końcowa walidacja

Uruchom pełną bramkę:

```bash
npm run typecheck
npm run lint
npm test
npm run deno:check
npm run deno:test
npm run check-knip
npm run expo-doctor
npm run expo-install-check
npm run check:ios-config
npm run check:sentry-disabled
npm run doctor:react:ci
npm run doctor:react:changed -- --base HEAD
./node_modules/.bin/react-doctor . --json --blocking none --yes --scope full
./node_modules/.bin/react-doctor design . --json --blocking none --yes --scope full
git diff --check
git status --short
```

Kryteria akceptacji:

1. TypeScript, ESLint, Vitest, Deno check/test i kontrole repozytorium przechodzą.
2. Pełny skan React Doctor nie zawiera potwierdzonych diagnostyk; wyjątek Storage jest wąski i ma test kontraktowy.
3. Skan `design` może nadal raportować jedną świadomie zachowaną sugestię czarnego tła.
4. Ostrzeżenie Vitest o przyszłym loaderze nie występuje albo próba naprawy została bezpiecznie wycofana i udokumentowana.
5. Nie zmieniły się pliki w `ios/`, `app.json`, zależności ani lockfile w ramach tej pracy.
6. Końcowy raport zawiera: wynik przed/po, listę zmian, odrzucone heurystyki z dowodami oraz wszystkie niewykonane kontrole.

## Oczekiwany zakres plików

Dozwolone zmiany:

- `supabase/functions/cleanup-moderation-evidence/contract.ts`
- `supabase/functions/delete-account/apple_test.ts`
- `supabase/functions/delete-account/handler_test.ts`
- `supabase/functions/delete-account/storage_test.ts`
- test kontraktowy dla `removeStoragePaths` w `storage_test.ts`
- `doctor.config.ts`
- `vitest.config.ts` → `vitest.config.mts`
- `package.json`
- `docs/react-doctor-baseline.md`

Każdy inny zmieniony plik wymaga osobnego uzasadnienia. Jeśli pojawi się diff w `ios/`, traktuj go jako istniejącą pracę użytkownika i nie dotykaj go.
