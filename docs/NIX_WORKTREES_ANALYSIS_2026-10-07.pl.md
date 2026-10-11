# Analiza katalogów NiX w folderze Projects

**Aktualizacja po porządkowaniu:** wszystkie 13 dodatkowych worktree'ów zostały usunięte po wykonaniu i sprawdzeniu kopii konfiguracji, materiałów oraz historii. Pozostał główny `NIX`. Poniższa analiza opisuje stan sprzed porządkowania; szczegóły operacji zapisano w `docs/NIX_WORKTREE_CLEANUP_2026-10-07.pl.md`.

Data: 7 października 2026. Zakres: wszystkie bezpośrednie podkatalogi `/Volumes/External-drive-lexar/Dev/Projects`, których nazwa zaczyna się od `NIX`, bez rozróżniania wielkości liter. Punktem odniesienia jest lokalny `main` na commicie `884abe1953e0a20db62a31f2bcfef8365763b404`.

## Najważniejszy wynik

W folderze nadrzędnym jest **14 katalogów NiX: główny checkout `NIX` i 13 dodatkowych worktree'ów jednego repozytorium Git**. Są to robocze katalogi po kolejnych etapach moderacji, weryfikacji, zmian narzędzi i przygotowania wydań. Nie są 14 niezależnymi projektami ani pełnymi kopiami zapasowymi.

Wszystkie korzystają ze wspólnego magazynu historii: `/Volumes/External-drive-lexar/Dev/Projects/NIX/.git`. Główny katalog zawiera rzeczywisty katalog `.git`; w pozostałych `.git` jest plikiem wskazującym na metadane worktree w głównym repozytorium. Usunięcie głównego magazynu Git uszkodziłoby obsługę historii wszystkich tych katalogów.

**Do dalszej pracy właściwy jest `NIX` na `main`.** Ma build iOS **6**, podczas gdy wszystkie 13 dodatkowych katalogów mają build **5**. Wszystkie deklarują tę samą wersję aplikacji/runtime `1.0.11`, więc sam numer wersji w `package.json` nie pozwala odróżnić aktualnych źródeł od starych. Starsze katalogi zawierają też różne wersje React Native: `0.86.2` lub `0.86.3`; główny katalog ma `0.86.3`.

Nie usunięto katalogów, branchy, konfiguracji, stashów ani artefaktów kompilacji. Dodano wyłącznie materiały analizy do głównego checkoutu.

## Zestawienie wszystkich katalogów

Kolumna „tylko main / tylko katalog” przedstawia liczbę commitów obecnych wyłącznie po danej stronie porównania. Nie oznacza liczby brakujących poprawek: squash i cherry-pick mogą zachować kod pod innymi commitami.

Rozmiary to pomiar `du -sk`, przeliczony na GiB i zaokrąglony. Suma nie gwarantuje odzyskania identycznej liczby fizycznych bloków dysku, np. przy współdzieleniu danych przez system plików.

| Katalog | Rozmiar | HEAD | Tylko main / tylko katalog | Przeznaczenie i ocena |
|---|---:|---|---:|---|
| `NIX` | 2,376 GiB | `884abe1` | 0 / 0 | Aktualny `main`; zachować jako główne miejsce pracy. |
| `NIX-build5-release` | 1,467 GiB | `c2175ce` | 88 / 0 | Detached HEAD; źródła wydania build 5. Cała historia na main. Archiwizacja po zabezpieczeniu lokalnej konfiguracji. |
| `NIX-c3b-audit-fixes` | 1,350 GiB | `300113c` | 44 / 0 | Detached HEAD; obecnie snapshot wyrównania zależności/patchy. Identyczny śledzony kod jak `NIX-pr26-patch-verify`. Zachować lokalny plik Xcode przed archiwizacją. |
| `NIX-c3b-landed` | 0,013 GiB | `e69ed99` | 66 / 0 | Branch `docs/c3b-landed`; dokumentacja zakończenia C3B. Historia włączona do main. |
| `NIX-c3b-main-verify` | 1,138 GiB | `c2a7b25` | 25 / 1 | Branch `fix/s0-binding-no-cli-override`; jedyny własny commit ma dokładny odpowiednik patcha na main. |
| `NIX-c6-landed` | 0,013 GiB | `22a7e0f` | 60 / 0 | Branch `docs/c6-landed`; zapis zakończenia C6. Historia włączona do main. |
| `NIX-c6-toolchain` | 1,138 GiB | `ea38647` | 62 / 0 | Branch `codex/c6-toolchain`; porządkowanie Node/Deno, RN i zależności. Historia włączona do main. |
| `NIX-p0-3-c3b-integration` | 1,154 GiB | `daa7606` | 68 / 0 | Detached HEAD; integracja workera, DB, fake Azure i budżetu F0. Historia włączona do main. |
| `NIX-p0-3-proof` | 0,012 GiB | `428b7f7` | 78 / 0 | Branch `codex/p0-3-hybrid`; dowody próbkowania wideo i scene guard. Historia włączona do main. |
| `NIX-p0-3-s0-c2` | 0,012 GiB | `c372ea2` | 74 / 0 | Branch `codex/p0-3-s0-c2`; próby C2/S0, koszt, cleanup i dowody. Historia włączona do main. |
| `NIX-p0-3-spike` | 1,145 GiB | `b565be0` | 82 / 2 | Branch `codex/sprint-3-adr`; starszy prototyp i unikalny plan. Zachować branch/dokument przed archiwizacją katalogu. |
| `NIX-p0-3-worker-runtime` | 0,012 GiB | `4be21b4` | 72 / 0 | Branch `codex/p0-3-worker-runtime`; runtime wideo i benchmark. Historia włączona do main. |
| `NIX-pr26-patch-verify` | 1,147 GiB | `300113c` | 44 / 0 | Detached HEAD; drugi checkout dokładnie tego samego commita co `NIX-c3b-audit-fixes`. Historia włączona do main. |
| `NIX-privacy-public-config` | 1,138 GiB | `2aa65e2` | 28 / 2 | Detached HEAD; privacy/legal i domyślnie wyłączona telemetria. Zmiany zachowane w późniejszym commicie main, mimo innej historii. |

**Stan dodatkowych katalogów:** wszystkie 13 mają czyste pliki śledzone i brak nieśledzonych plików nieobjętych ignorowaniem. To nie obejmuje konfiguracji, zależności ani wyników kompilacji ignorowanych przez Git. Główny checkout ma nowe, nieśledzone materiały tego audytu i wcześniejszej analizy projektu.

## Czy coś trzeba jeszcze przenosić do main?

### Dziesięć katalogów ma historię w całości na main

HEAD dziesięciu worktree'ów jest przodkiem `main`. Ich commity są już osiągalne z głównej historii. Starszy katalog nadal może zawierać historyczną wersję pliku, który później zmieniono lub usunięto; taką wersję można odtworzyć z Git bez utrzymywania osobnego checkoutu.

### `NIX-c3b-main-verify`: inny commit, ta sama poprawka

Commit `c2a7b25` nie jest przodkiem main, ale `git cherry` oznacza go jako odpowiednik istniejącej poprawki. Ma identyczny patch-id jak `6d8bcc9` na main. Zmienione skrypty `check-moderation-spike-evidence.mjs` i odpowiadający test są identyczne z main. Nie znaleziono brakującej poprawki wymagającej ponownego scalenia.

### `NIX-privacy-public-config`: zmieniona historia, zachowany rezultat

Commity `37d62db` i `2aa65e2` nie są przodkami main ani dokładnymi odpowiednikami patchy według `git cherry`. Sprawdzono więc treść: **wszystkie 20 zmienionych plików jest identycznych z późniejszym commitem main `9f52de8`**. Dwanaście nadal jest identycznych z obecnym HEAD; osiem później rozwijano, głównie dokumentację legal/listing/roadmap i `legalDocuments.ts`.

Nie ma potrzeby kopiowania kodu z tego katalogu. Pierwotny commit `2aa65e2` jest obecnie utrzymywany przez lokalny remote-tracking ref `origin/pr-31`, bez lokalnego brancha. Jeżeli chcemy zachować oryginalny zapis zmian, warto nadać mu trwałą referencję albo objąć go archiwum Git przed porządkowaniem referencji.

### `NIX-p0-3-spike`: unikalny materiał historyczny

Dwa commity `3f007fa` i `b565be0` pozostają poza historią main i nie są równoważne patchami. Kod to starszy prototyp Azure F0 i próbkowania wideo; main zawiera późniejszą, pełniejszą implementację scene guard, polityki, workera i integracji DB.

Istnieje jednak **historyczny plan nieobecny w aktualnym main**: `docs/plans/2026-08-27-sprint-3-pre-delivery-content-moderation.md`, 280 linii. Należy zachować branch `codex/sprint-3-adr` lub świadomie zarchiwizować dokument. Nie należy opisywać tego katalogu jako całkowicie zintegrowanego.

Historyczny patch kompresora audio nie jest brakującą poprawką: jego część iOS zachowano na main w `react-native-compressor+1.19.4.patch`, rozszerzonym także o obsługę dekodowania Android.

## Co zajmuje miejsce?

| Składnik | Wszystkie katalogi | Dodatkowe 13 worktree'ów |
|---|---:|---:|
| Całość | **12,114 GiB** | **9,739 GiB** |
| `node_modules` | 10,411 GiB | 9,142 GiB |
| `ios/Pods` | 0,607 GiB | 0,404 GiB |
| `dist` | 0,049 GiB | 0,026 GiB |
| `.expo` | 0,063 GiB | 0,001 GiB |
| `build` | 0,744 GiB | 0 GiB |

Około **94% rozmiaru dodatkowych katalogów stanowią same `node_modules`**. Osiem dodatkowych worktree'ów ma własną instalację zależności. Historia Git nie jest kopiowana czternaście razy: wspólny `.git` zajmuje około 56 MiB.

Pięć małych katalogów (`c3b-landed`, `c6-landed`, `proof`, `s0-c2`, `worker-runtime`) zajmuje łącznie tylko około **64 MiB**. Ich archiwizacja uporządkuje widok folderów, ale niewiele zmieni ilość wolnego miejsca. Największy efekt da usunięcie niepotrzebnych checkoutów z zależnościami po zabezpieczeniu wskazanych materiałów.

W głównym `NIX/build` są trzy ignorowane archiwa Xcode: `NiX.xcarchive` dla 1.0.3 (1), `NiX-1.0.5-6.xcarchive` i `NiX-1.0.5-7.xcarchive`. Zajmują łącznie około 0,744 GiB i pochodzą z lipca. Mogą służyć do odtworzenia dawnych wydań oraz symbolikacji błędów. Są osobnym tematem od dodatkowych worktree'ów; niczego z nich nie usunięto.

## Materiały do zabezpieczenia przed przyszłym porządkowaniem

### Lokalna konfiguracja poza Git

W `NIX-build5-release` istnieją ignorowane `.env`, `.env.production.local` i `ios/.xcode.env.local`. Nie są identyczne z konfiguracją głównego checkoutu; `.env.production.local` nie ma tam odpowiednika. W `NIX-c3b-audit-fixes` istnieje dodatkowy, odmienny `ios/.xcode.env.local`.

Git nie zachowa tych plików po usunięciu worktree. Należy zabezpieczyć je oddzielnie, z zachowaniem poufności. Raport i załączony JSON nie zawierają wartości zmiennych ani ich skrótów.

W `c3b-integration` są ponadto historyczny eksport `dist` i log eksportu `.expo/dev/logs/export.log`; podobne eksporty są w katalogach weryfikacji patchy. To wyniki narzędzi, a nie nowy kod źródłowy. Można je zachować, jeśli mają służyć jako dowody dawnych weryfikacji.

### WIP bez osobnego folderu

Wspólna historia zawiera branch **`wip/local-pre-sync-20260911`**, commit `13943d2`, bez osobnego worktree. Jest 80 commitów za main i ma jeden własny commit; ten branch jest jego jedyną lokalną referencją. Nie należy usuwać go automatycznie razem ze starymi katalogami.

Zachowuje nieobecne na main materiały:

- alternatywny prototyp moderacji Edge: `_shared/moderation-azure.ts`, `send-text-message/index.ts` i `moderation-worker/index.ts` w `supabase/functions`;
- monitoring SLA w `scripts/check-moderation-sla.mjs`, wrapper lokalny i instrukcje operacyjne;
- checker uprawnień Supabase oraz dokumentację grantów;
- historyczne plany Sprintu 3, App Review i draft polityki prywatności po enforcement;
- alternatywny stan klienta `moderation_pending` i przepływ kolejki uploadu.

To archiwum starszej pracy, a nie gotowa aktualizacja main. Bezpośredni diff obejmuje 154 pliki; większość różnic wynika z braku późniejszych zmian. Przeniesienie całego snapshotu cofnęłoby nowsze zabezpieczenia i migracje. Checker uprawnień ma też błąd wyszukiwania `PUBLIC` w `pg_roles`, a starszy przepływ klienta nie zachowuje aktualnej obsługi `moderationJobId`.

### Trzy zachowane stashe

Repozytorium zawiera trzy wpisy stash z 15, 22 i 24 lipca: snapshot przed merge, lokalne obejścia CocoaPods oraz zmiany przeniesione do agenta chmurowego. Są współdzielone przez worktree i nie pojawiają się jako bieżące zmiany w żadnym katalogu. Przyszłe archiwum historii powinno objąć każdy z tych wpisów, jeżeli ich przydatność nie zostanie wcześniej oceniona.

## Zalecane uporządkowanie

1. Pozostawić `NIX/main` jako jedyny stały katalog do pracy. Aktualny main jest punktem odniesienia także dla wcześniejszego audytu kodu.
2. Zabezpieczyć lokalną konfigurację z `build5-release` i `c3b-audit-fixes`, branch `codex/sprint-3-adr`, oryginalną referencję privacy, snapshot WIP oraz trzy stashe. Usunięcie worktree nie musi oznaczać usunięcia jego brancha.
3. Zarchiwizować dodatkowe checkouty, które nie są już potrzebne operacyjnie. Pod względem przeniesienia zmian 12 z 13 nie wymaga nowego scalania; `spike` wymaga zachowania wskazanej historycznej treści. Wszystkie 13 mogą zostać wycofane jako katalogi po spełnieniu tych warunków.
4. Używać obsługi worktree w Git zamiast ręcznego kasowania folderów, aby nie pozostawić martwych wpisów w metadanych. Nie wymuszać usuwania bez wcześniejszego sprawdzenia ignorowanych materiałów.
5. Dla następnych krótkich zadań usuwać roboczy checkout po zakończeniu i zachowaniu potrzebnych rezultatów. Nazwa folderu, data jego modyfikacji i wersja `1.0.11` nie wystarczają do oceny aktualności; sprawdzać branch i HEAD.

Nie znaleziono procesu z bieżącym katalogiem pracy wskazującym na dodatkowy worktree; znalezione procesy pracowały w głównym `NIX`. To chwilowy odczyt i nie dowodzi, że żaden edytor nie ma otwartych plików z historycznych katalogów.

## Metoda i ograniczenia

Sprawdzono katalog nadrzędny, `git worktree list`, wspólny magazyn Git, HEAD/branch, stan tracked/untracked/ignored, relacje przodków, liczbę commitów, `git cherry`, równoważność patchy i treść rozbieżnych zmian. Zmierzono rozmiary oraz porównano metadane aplikacji i lokalne konfiguracje. Porównanie konfiguracji nie publikuje ich zawartości.

Analiza dotyczy lokalnego dysku i lokalnych referencji Git. `origin/main` wskazuje ten sam commit co lokalny main, ale **nie wykonano fetch**, więc nie potwierdzono bieżącego stanu serwera. Nie uruchamiano ponownie testów w historycznych checkoutach; ich wyniki nie zmieniłyby relacji historii ani duplikacji katalogów. Nie wykonywano czyszczenia.

Załączniki w głównym checkoutcie:

- `docs/audit-evidence/2026-10-07-nix-worktrees.json` — inwentarz 14 katalogów, rozmiary, referencje i rozstrzygnięcia różnic historii;
- `docs/PROJECT_ANALYSIS_2026-10-07.pl.md` — wcześniejsza szczegółowa analiza aktualnego kodu projektu. Porządkowanie folderów nie rozwiązuje opisanych tam problemów aplikacji.
