# NiX 1.0.12 — przygotowanie App Review, 2026-10-08

**Status na 2026-10-09: IN PROGRESS / nie READY FOR APP REVIEW.** Publiczny build 8 jest przetworzony w ASC i przypisany do NiX Internal QA; backend jest wdrożony i przeszedł produkcyjny smoke. Finalne zgłoszenie i odpowiedź Apple nie zostały wysłane. Zakres: iPhone, dotychczasowe 175 regionów, PL/EN, bezpłatność, runtime 1.0.12, kanał production, ręczne wydanie.

## Wykonane

- Numer 8 wolny w ASC; aplikacja, projekt Xcode i widget ustawione na **1.0.12 (8)**.
- Przywrócono privacy/terms PL/EN i dodano support PL/EN na SEOHOST. AASA zwraca 200 application/json bez przekierowania; testowa trasa zaproszenia zwraca właściwy landing. Publiczny walidator PASS.
- Katalog subdomeny zawierał inną stronę główną i nie zawierał katalogów NiX. Wdrożenie zachowało tę stronę. Landing NiX jest publikowany jako `nix-invite.html`, a `/invite/*` prowadzi do niego. Nagłówki bezpieczeństwa obejmują trasy NiX.
- Zweryfikowane FTPS: odtworzono brakującą ścieżkę certyfikatów do systemowego zaufanego USERTrust i włączono reuse sesji TLS dla transferów. Nie wyłączano sprawdzania certyfikatu. Kopie nadpisanych plików i receipt są poza Git.
- Publiczne dokumenty HTML generowane z treści aplikacji; pakiet prawny 2026-10-08 uwzględnia istniejący worker OVHcloud. Nowe akceptacje zapisują tę wersję; wcześniejsze akceptacje nie są automatycznie przepisywane. Retencja i wyłączone flagi analityki pozostają zgodne z obecnym zakresem.
- Mac Apple Silicon i Vision Pro wyłączone i zapisane w ASC. 175 regionów zachowane.
- TypeScript, lint, Knip, konfiguracja iOS, wyłączenie Sentry i produkcyjny preflight PASS.
- Vitest: **100 zestawów / 578 testów PASS**. React Doctor: **549 plików, 0 błędów i 0 ostrzeżeń**, bez baseline. Expo Doctor: **20/20 PASS**; macierz wersji PASS.
- Reviewed dependency gate PASS. Bieżący npm audit: **23 high**, brak critical; bezpośrednie przyczyny to istniejące wyjątki braces i node-forge, bez dodania nowego wyjątku. Raw audit pozostaje jawny.

## Backend: obserwacja przed wdrożeniem

Produkcja NiX `xjdjlxfulpqpundkcdul` jest ACTIVE_HEALTHY, PostgreSQL 17.6, region eu-west-1. Ma **46 migracji**, bez `20261007120000` i `20261007121000`. Brak zarządzanej gałęzi staging. Moderacja przed dostarczeniem jest włączona. W chwili odczytu brak pending/processing; 66 approved i 3 error. Nie wykryto aktywnych obrazów większych niż 4 MiB.

Worker na OVH: `nix-moderation-worker:e1d73cf`. Wszystkie 17 istniejących Edge Functions mają verify_jwt=true. Snapshot wersji, hashy bundli i migracji jest zachowany poza Git. Powyższe odczyty nie zastępują backupu, próby odtworzenia, staging ani kontroli przepływów z realnymi JWT.

## Bramka backendu i rollback

1. Draft PR uruchamia istniejące jobs migracji oraz realnego Auth/Storage A/B; zapisać dokładny SHA i wyniki. SQL ze stubami nie jest dowodem tych kontroli.
2. Ustalić dostęp do backupu DB i obiektów Storage. Dump metadata Storage nie jest kopią plików. Backup musi obejmować dane aplikacji, Auth, Storage metadata, private konfigurację i historię migracji, z osobnym bezpiecznym odtworzeniem sekretów/Vault.
3. Odtworzyć backup w izolowanym środowisku, odłączyć wszystkie produkcyjne integracje i sprawdzić liczniki oraz integralność. Nigdy nie uruchamiać z odtworzonej konfiguracji produkcyjnych cronów/push/Azure.
4. Na staging przećwiczyć oba forward migrations, zaktualizowane Edge Functions i worker. Zweryfikować kontrolowaną obsługę starszych buildów 6/7, istniejących batchy i lease oraz finalnego builda 8.
5. Do produkcji dopuścić tylko manifest zgodny z zatwierdzonym SHA po backup/restore i staging PASS. Wstrzymać worker na czas operacji wymagających tego w sprawdzonej kolejności; nie gubić zadań i nie wyłączać moderacji w celu doręczenia.
6. Rollback zatrzymuje nowe dostarczanie i worker, zachowuje zaostrzone granty/RLS oraz nienadpisywalność Storage. Kod cofnąć wyłącznie do sprawdzonej wersji kompatybilnej z utwardzonym schematem. Nie przywracać direct INSERT ani fail-open.

## Wykonany backend i kandydat

- Draft [PR #55](https://github.com/endurance71/NIX/pull/55) uruchomił pełny workflow. [GitHub CI](https://github.com/endurance71/NIX/actions/runs/37832523483): realny PostgreSQL 17/Auth/Storage A i B, migracje, runtime i Swift PASS. EAS quality run `01a11cff-3be1-7bdf-95e7-ef7f2c2d97ed` PASS na `2c8aae1`. Naprawiono brak FFmpeg w obu środowiskach CI, brak kopiowania modułu workera do obrazu i kod błędu odmowy Storage. Nie osłabiono bramek.
- Backup obejmuje DB/Auth/Storage metadata/private/history, 47 rzeczywistych obiektów Storage (29 183 942 bajty), kod 17 funkcji, obraz workera oraz osobno zabezpieczone sekrety. Artefakty zaszyfrowano. Odtworzenie z zaszyfrowanej kopii w izolowanym PostgreSQL 17.6 bez sieci: zgodne liczniki 70 tabel i SQL. Obiekty odszyfrowano, przesłano do osobnego prywatnego bucketa w lokalnym Storage i pobrano przez prawdziwe API: wszystkie 47 hashy zgodne. Zastosowanie obu migracji do odtworzonych danych PASS. Pełne usługi Auth/Storage uruchomiono dodatkowo w oddzielnym stagingu, bez produkcyjnych kluczy i integracji. Próba obiektów była oddzielna od restore DB i nie aktywowała produkcyjnych sekretów Vault ani oryginalnych mapowań bucket/key.
- Staging: realny Auth/Storage, TUS POST/PATCH/HEAD, signed upload, idempotency, finalizacja, dokładny obraz workera, odbiór tekstu/zdjęcia/filmu, report/block/delete PASS. Azure zastąpione lokalnym serwerem bez przekazywania żądań na zewnątrz. Próba kolejności na starym schemacie: nowe funkcje → trzy pending jobs → migracje → worker, wszystkie trzy zadania zachowane i dostarczone.
- Backend SHA `bbd143643a85665c378d2a197a4020b1f5843642`. Produkcja: 48 migracji, obie `20261007120000` i `20261007121000` zastosowane; 16 funkcji wdrożonych z JWT, starsza `cleanup-snap` zachowana. Obraz workera `sha256:8f924da11fecb0bcf3cc22ed3055f06f23163ef20da78df3a9f0432726b86960`, restart count 0. Ochrona treści pozostawała włączona podczas rolloutu.
- Produkcyjny smoke na trzech osobnych kontach PASS: realna moderacja Azure i dostarczenie, TUS, idempotency, zakaz nadpisania approved Storage z kontrolą niezmienionych bajtów, report/block, odmowa kolejnej wysyłki po blokadzie, deletion. Te trzy konta usunięto przez endpoint aplikacji; pierwotne 20 kont pozostaje. Pending/processing i cleanup backlog 0, wcześniejsze trzy błędy bez wzrostu. Cron cleanup/push/export odczytany jako succeeded; status samego crona nie zastępuje HTTP smoke endpointów.
- Azure F0 potwierdzone w ARM. Smoke zużył 15 transakcji zamiast planowanych 8: 13 próbek filmu, zdjęcie i tekst. Jest to jawne przekroczenie założenia testowego; nie zmieniono budżetu ani jakości moderacji. Ledger: consumed 64, external floor 3630, ceiling 4000, reserved 0, zapas 306. Nie wykonywano kolejnych testów Azure.
- Starszy build 6 miał lokalny limit zdjęcia 10 MiB; utwardzony backend przyjmuje do 4 MiB. Większe zdjęcia ze starego klienta są kontrolowanie odrzucane, bez obejścia moderacji. Format API dla dopuszczonych plików pozostaje zgodny. Dodatkowa próba requestu builda 6 dla 5 MiB na staging zwróciła HTTP 400 `INVALID_SIZE`, bez uploadu i wywołania Azure. Testy kontraktów i istniejących zadań PASS; pełne QA rzeczywistych binariów 6/7 pozostaje niewykonane.
- Lokalny Xcode Release Archive/export/upload PASS. `testFlightInternalTestingOnly=false`, app/widget 1.0.12 (8), APNs production, `get-task-allow=false`, PL/EN, iPhone, runtime/channel/backend potwierdzone w IPA i ASC. Client SHA `1300dc1283eb55434cdfcf3d0100f4ad11141bf3`. IPA SHA256 `29ff374d5898aa6c9f7ed741b0accf0259533ddc0d64e6fcf0e2405231259ce0`; Hermes `7961d01d3aa7cebead99f03a2aa02279be5287373b687dffc19247b61d15d575`.
- Build ID `fc5ea753-5d50-41ab-8524-3818fb4695b6`: ASC Validated / Ready to Submit, przypisany do NiX Internal QA i Team (Expo). Nie jest wysłany do App Review. W selektorze odrzuconej wersji nie był jeszcze dostępny, a sesja ASC wygasła — wybór wymaga ponownego dostępu i kontroli.
- Metadata wersji zapisane jako 1.0.12; dodano PL i zaktualizowano opisy oraz support URL PL/EN. Historyczny build 6 odpięto od wersji. Ręczne wydanie zachowane. Publiczne screenshoty i pozostałe kwestionariusze wymagają finalizacji.
- Production OTA: odczyt nie wykazał żadnej aktualizacji dla runtime 1.0.12. Kandydat używa wskazanego embedded bundle. Nie publikowano OTA. Zamrożenie oznacza zakaz publikacji dla tego runtime do zakończenia QA i ponownej oceny każdej późniejszej zmiany; kanał nie został technicznie zablokowany. Finalny snapshot OTA należy ponownie potwierdzić po QA.

Supabase Security Advisor po wdrożeniu nie zgłosił ERROR. INFO obejmuje 14 tabel celowo dostępnych tylko przez service/RPC; WARN obejmuje 46 uwierzytelnionych SECURITY DEFINER RPC, prywatny helper miesiąca z mutable search_path oraz dotychczasowe ustawienia ochrony haseł i MFA Auth. Nie wyłączano RLS ani bramek, nie włączano nowych przepływów MFA w tym wydaniu. Przegląd: [linter](https://supabase.com/docs/guides/database/database-linter), [ochrona haseł](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [MFA](https://supabase.com/docs/guides/auth/auth-mfa). Wymagania DSA i zastosowanie ICP trzeba potwierdzić z właścicielem oraz aktualnym [App Information Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/); nie uznano samego pola ICP za dowód obowiązku dla NiX.

## Pozostałe warunki

| Kontrola | Stan |
| --- | --- |
| Draft PR / zdalne CI Auth/Storage A/B | PASS |
| Backup + odtworzenie + staging + rollout | PASS; manifest i zaszyfrowane dowody poza Git |
| Publicznie kwalifikujący archive/export/upload builda 8 | PASS |
| Finalny build w NiX Internal QA | Przetworzony i przypisany |
| Konta reviewera i pełne QA finalnego binary | Do wykonania; backend smoke PASS |
| iPhone, zgodność iPad, IPv6/NAT64 | Do wykonania |
| Nagranie właściciela z finalnego builda | Do wykonania |
| Odpowiedź EN i Review Notes bez placeholderów | Zależne od dowodów |
| Metadata PL/EN, screenshoty i wybrany build | Opisy/URL/wersja zapisane; screenshoty i wybór 8 pending |
| App Privacy, wiek, export compliance, DSA i regiony/ICP | DSA nieukończone; reszta do finalnej kontroli; ICP wymaga danych właściciela |

Właściciel wykonuje nagranie na fizycznym iPhonie Damian zgodnie z sześcioma pytaniami Apple. Konta demo reviewera pozostają aktywne; rejestracja i deletion używają odrębnego konta. Wideo musi zaczynać się uruchomieniem aplikacji i obejmować report/block, tekst, zdjęcie i film. Potrzebna jest także rzeczywista odpowiedzialna osoba i procedura obsługi zgłoszeń; nie zakładać ich tylko na podstawie obecności endpointu.

Scenariusz i tabela dowodów: [QA finalnego builda](APP_REVIEW_FINAL_QA_2026-10-09.pl.md). [Manifest wdrożenia i recovery](BACKEND_DEPLOYMENT_2026-10-09.md). Są to konkretne blokery gotowości, a nie zgoda na pominięcie testów lub samodzielne ograniczenie regionów.

## Dowody i bezpieczeństwo

Artefakty: `/Users/damianmotylinski/.nix-ops/app-review-preparation-2026-10-08/`. Hasła, klucze, UUID kont testowych, backup danych i materiał UGC nie trafiają do Git. Source SHA i hash finalnego IPA należy zapisać po zamrożeniu kandydata; późniejsze zmiany źródła wymagają nowej oceny testów.

Stan nadrzędny: [ios-current.md](ios-current.md). Feedback: [analiza Apple](../APP_REVIEW_FEEDBACK_ANALYSIS_2026-10-08.pl.md). [Szkic odpowiedzi](apple-review-response-draft-2026-10-08.en.md) pozostaje niewysłany i zawiera tylko jawne miejsca wymagające dowodu.
