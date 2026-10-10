# Ewaluacja agentów: punkt odniesienia (2026-10-10)

Pomiar według artykułu Expo „Your skills need an evaluation mechanism”. Harness i instrukcja: `scripts/agent-evals/README.md`.

## Warianty

- **przed** (`--instructions none`): brak `AGENTS.md` i `CLAUDE.md`, brak `.claude/settings.json`. Wtyczka Expo nie jest zainstalowana, a globalne `skillOverrides` wyłączają skille stacku. Zasady były wtedy tylko w `.cursor/rules`.
- **po** (`--instructions worktree`): `AGENTS.md` z mapą „cel → doc → skill”, wtyczka `expo@claude-plugins-official` (24 skille, w tym `expo-overview`), 6 skilli włączonych dla projektu. W katalogu jest 67 skilli.

Kod: gałąź `fix/pre-review-hardening` (runtime 1.0.12), stan z 2026-10-10. Model: Sonnet. Jeden run na scenariusz i wariant, łączny koszt około $3.8. **To mała próba.** Traktuj ją jako wczesny sygnał, nie jako statystykę.

## Wynik

| wariant | pass | trigger skilli | recall skilli | recall docs | 1. guidance (poz.) | naruszenia kod |
| --- | --- | --- | --- | --- | --- | --- |
| przed | 60% (3/5) | 0% | 0% | 13% | 0.50 | 1 |
| po | 100% (5/5) | 60% | 50% | 54% | 0.01 | 0 |

## Co pokazały trace'y

- **„Przed”: wiarygodny wynik bez wskazówek.** Scenariusz UI przeszedł bez czytania żadnego z 3 dokumentów. Ten sam wzorzec opisuje Expo: wynik końcowy ukrywa brak wskazówek.
- **„Przed”: zepsuty build.** W `copy-friend-code` agent dodał `import 'expo-clipboard'` bez pakietu w `package.json`. Wyłapała to statyczna kontrola `missingImports`.
- **„Przed”: migracja nie przeszłaby CI.** Agent nie dopisał jej do listy `expected` w `scripts/check-supabase-migrations.mjs` i nie uruchomił kontroli. „Po” zrobił oba kroki. Wiedza o tym trafiła do `AGENTS.md` (zasada 6).
- **„Po”: wskazówki ładowane od razu** (pozycja 0.01). `expo-overview` nie został załadowany ani razu, bo `AGENTS.md` kieruje bezpośrednio do skilli docelowych.
- **„Po”: pominięte skille (pole do poprawy).**
  - `copy-friend-code` nie załadował `expo-ui`, bo agent wzorował się na istniejącym `NativeSettingsRow`.
  - `hotfix-to-testers` nie załadował `eas-update`, przeczytał tylko `docs/release/ios-current.md`.
  - `friend-nickname-schema` załadował tylko jeden z pary `supabase` i `supabase-postgres-best-practices`. To ten sam wzorzec „para zalecana razem, załadowana połowa” co w artykule.

## Błędy ground truth znalezione przez trace'y

Trzy scenariusze miały błędne kryteria. W każdym agent zachował się poprawnie:

1. **`hotfix-to-testers`:** agent słusznie wstrzymał OTA, bo `docs/release/ios-current.md` zakazuje go dla runtime 1.0.12.
2. **`copy-friend-code`:** harness blokuje instalacje, więc poprawne jest też zatrzymanie się z planem i rozpoznanie zmiany natywnej.
3. **`mute-friend-schema`:** funkcja już istniała (`conversation_mutes`). Scenariusz zastąpiono `friend-nickname-schema`.

## Następne kroki

- 3 runy na wariant przed wyciąganiem wniosków o recall.
- Mierzyć pary skilli: rozważyć w `AGENTS.md` regułę „gdy ładujesz jeden z pary, załaduj oba”.
- Warstwa „app behavior” (agent sprawdzający aplikację w symulatorze iOS) jeszcze nie istnieje.
