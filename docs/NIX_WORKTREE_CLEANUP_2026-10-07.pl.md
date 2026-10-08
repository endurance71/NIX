# Porządkowanie dodatkowych katalogów NiX

Wykonano: 2026-10-07T19:07:19.255229+00:00. Usunięto wszystkie 13 dodatkowych worktree'ów Git z `/Volumes/External-drive-lexar/Dev/Projects`. Pozostał główny `NIX` na `main`, commit `884abe1953e0a20db62a31f2bcfef8365763b404`.

Rozmiar usuniętych katalogów przed operacją: **9.74 GiB**. Zaobserwowany wzrost wolnego miejsca na woluminie: **10.06 GiB**; odczyt może uwzględniać równoległą aktywność systemu. Kopia zajmuje około **25.8 MiB**.

## Zachowane materiały

- Wszystkie pierwotne branche, referencje i trzy stashe są zachowane w głównym repozytorium.
- Utworzono trwałe referencje archiwalne do wszystkich wersji worktree'ów, snapshotu WIP i każdego stasha.
- Zachowano 346 ignorowanych plików, w tym lokalne konfiguracje, logi eksportów i wygenerowane eksporty. Pominięto regenerowalne `node_modules`, `ios/Pods` i `.DS_Store`.
- Utworzono Git bundle oraz osobny plik granicy historii płytkiego klonu. Odtworzenie wszystkich referencji w tymczasowym repozytorium i `git fsck --full` zakończyły się powodzeniem. Zawartość archiwów plików porównano z oryginałami.

Prywatna kopia: `/Volumes/External-drive-lexar/Dev/Projects/NIX/.git/nix-worktree-archives/20261007T185929Z`.

[Instrukcja odtworzenia](/Volumes/External-drive-lexar/Dev/Projects/NIX/.git/nix-worktree-archives/20261007T185929Z/README.md). Konfiguracje znajdują się w archiwach `ignored-files/*.tar.gz`; pliki kopii są lokalne i mają ograniczone uprawnienia. Raport nie publikuje wartości zmiennych.

## Usunięte katalogi

- `NIX-build5-release`
- `NIX-c3b-audit-fixes`
- `NIX-c3b-landed`
- `NIX-c3b-main-verify`
- `NIX-c6-landed`
- `NIX-c6-toolchain`
- `NIX-p0-3-c3b-integration`
- `NIX-p0-3-proof`
- `NIX-p0-3-s0-c2`
- `NIX-p0-3-spike`
- `NIX-p0-3-worker-runtime`
- `NIX-pr26-patch-verify`
- `NIX-privacy-public-config`

## Kontrola końcowa

Git rejestruje wyłącznie główny worktree. W folderze nadrzędnym pozostał jeden katalog zaczynający się od NiX. HEAD, pierwotne referencje, stashe i stan plików głównego projektu nie zmieniły się podczas usuwania; po weryfikacji dodano ten protokół. Nie usuwano artefaktów build ani konfiguracji z głównego NIX.
