# Ewaluacja instrukcji dla agentów (AGENTS.md, docs, skille)

Harness według artykułu Expo „Your skills need an evaluation mechanism”: zmiany instrukcji dla agentów mierzymy na realistycznych zadaniach, zamiast oceniać je „na oko” albo wywołując skill po nazwie.

## Co jest mierzone (3 warstwy)

| Warstwa | Pytanie | Metryka |
| --- | --- | --- |
| Trigger / discovery | Czy wskazówki w ogóle weszły do kontekstu? | `trigger skilli`, `recall skilli`, `recall docs`, pozycja pierwszego załadowania |
| Uptake (proces + kod) | Czy widać je w komendach i w diffie? | naruszenia: `eas build`, `npm install expo-*`, `@expo/vector-icons`, legacy `Animated`, `Dimensions.get`, hexy w `src/app|components`, edycja istniejących migracji |
| Wynik | Czy run spełnił scenariusz? | `pass` = brak naruszeń + wymagane pliki/komendy/odpowiedź |

Brak skilla **nie** oblewa runu. Spada tylko recall, bo rozwiązanie zadania bez skilla może znaczyć, że model bazowy już tę wiedzę ma.

## Uruchamianie

```bash
npm run eval:agents -- --label with-agents-md --runs 3
```

```bash
npm run eval:agents -- --label baseline --instructions none --runs 3
```

```bash
npm run eval:agents:report -- --results baseline --results with-agents-md
```

- `--instructions worktree|head|none|ref:<git-ref>`: instrukcje z bieżącego working tree (domyślnie, czyli także niezacommitowane), z `HEAD`, bez `AGENTS.md` / `CLAUDE.md` / `.claude/skills` / `.claude/settings.json` (stan sprzed 2026-10-10: bez wtyczki Expo i skilli projektu) albo z innego refa przy tym samym kodzie (CI: `ref:origin/main`).
- `--scenario <id>` (wielokrotnie), `--model`, `--max-budget-usd` (domyślnie 2 na run), `--settings <plik>` (np. wariant `skillOverrides`), `--plugin-dir <dir>` (np. lokalna wtyczka Expo Skills).
- `--isolated`: bez serwerów MCP. Domyślnie zostaje prawdziwe środowisko, bo wykrywanie skilli zależy od tłoku w katalogu (Codex przy 175 skillach pokazywał ok. 60 znaków opisu).
- Każdy run to świeży `git worktree` z `HEAD`. `eas`, instalacje pakietów, `supabase`, `git commit` i `git push` są blokowane, ale próba zostaje w trace i jest oceniana.
- Wyniki trafiają do `scripts/agent-evals/results/<label>/` (gitignored): `*.trace.jsonl`, `*.diff`, `*.json`, `summary.json`.

Raport per run podaje też `catalogSize` (ile skilli agent widział) i `unavailableSkills` (oczekiwane skille, których nie było w katalogu). Odróżnia to „agent nie wybrał” od „agent nie mógł wybrać”.

## CI

`.github/workflows/agent-evals.yml`: dodanie etykiety `eval` do PR uruchamia scenariusze dwa razy na tym samym kodzie, z instrukcjami z `main` i z PR. Wynik trafia do komentarza w PR. Wymaga sekretu `ANTHROPIC_API_KEY` i jest płatne. Ponowne uruchomienie: zdejmij i dodaj etykietę. W CI nie ma skilli z `~/.claude/skills`, więc pojawią się w `unavailableSkills`.

Alternatywnie wtyczki z własnym zestawem `evals/` można mierzyć natywnie przez `claude plugin eval` (porównuje z wariantem bez wtyczki).

## Metryki na prawdziwych sesjach

```bash
npm run eval:agents:report -- --transcripts ~/.claude/projects/-Volumes-External-drive-lexar-Dev-Projects-NIX
```

Polecenie liczy udział sesji, które załadowały skill albo przeczytały kluczowy doc, i wypisuje naruszenia zasad procesu w historii pracy.

## Dodawanie scenariusza

Scenariusz w `scenarios.json` pisz jak prośbę użytkownika: opisz cel, bez nazw skilli i ścieżek. Następnie dodaj adnotacje:

- `expectedDocs` / `expectedSkills`: co powinno pomóc (tylko do recall),
- `rules`: zestawy z `ruleSets` (`deploy`, `deps`, `nativeFirst`),
- `requiredChangedFiles`, `expectedCommands`, `expectedAnswer`, `protectedPaths`, `noChanges`: ground truth wyniku.

Kto zmienia `AGENTS.md`, doc albo skill, ten dopisuje lub aktualizuje scenariusz, tak jak test jednostkowy. Logikę oceny pilnuje `npm run test:agent-evals`.

**Najpierw czytaj trace.** Pierwszy smoke run (`hotfix-to-testers`) oblał, a agent zachował się poprawnie: wstrzymał OTA, bo `docs/release/ios-current.md` je blokował. Błędny był ground truth. Zanim zmienisz instrukcje, sprawdź, czy scenariusz mierzy właściwą rzecz.
