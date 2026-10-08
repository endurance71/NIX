# NiX 1.0.12 — przygotowanie App Review, 2026-10-08

**Status: IN PROGRESS / nie READY FOR APP REVIEW.** Finalne zgłoszenie i odpowiedź Apple nie zostały wysłane. Zakres zatwierdzony przez właściciela: iPhone, dotychczasowe 175 regionów, pełne poprawki aplikacji i backendu, wersja 1.0.12, runtime 1.0.12, kanał production, ręczne wydanie.

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

## Pozostałe warunki

| Kontrola | Stan |
| --- | --- |
| Draft PR / zdalne CI Auth/Storage A/B | Do wykonania |
| Backup + odtworzenie + staging + rollout | Do wykonania |
| Publicznie kwalifikujący archive/export/upload builda 8 | Do wykonania |
| Finalny build w NiX Internal QA | Do wykonania |
| Konta reviewera i pełne produkcyjne QA | Do wykonania |
| iPhone, zgodność iPad, IPv6/NAT64 | Do wykonania |
| Nagranie właściciela z finalnego builda | Do wykonania |
| Odpowiedź EN i Review Notes bez placeholderów | Zależne od dowodów |
| Metadata PL/EN, screenshoty i wybrany build | Do wykonania |
| App Privacy, wiek, export compliance, DSA i regiony/ICP | Do potwierdzenia |

Właściciel wykonuje nagranie na fizycznym iPhonie Damian zgodnie z sześcioma pytaniami Apple. Konta demo reviewera pozostają aktywne; rejestracja i deletion używają odrębnego konta. Wideo musi zaczynać się uruchomieniem aplikacji i obejmować report/block, tekst, zdjęcie i film. Potrzebna jest także rzeczywista odpowiedzialna osoba i procedura obsługi zgłoszeń; nie zakładać ich tylko na podstawie obecności endpointu.

## Dowody i bezpieczeństwo

Artefakty: `/Users/damianmotylinski/.nix-ops/app-review-preparation-2026-10-08/`. Hasła, klucze, UUID kont testowych, backup danych i materiał UGC nie trafiają do Git. Source SHA i hash finalnego IPA należy zapisać po zamrożeniu kandydata; późniejsze zmiany źródła wymagają nowej oceny testów.

Stan nadrzędny: [ios-current.md](ios-current.md). Feedback: [analiza Apple](../APP_REVIEW_FEEDBACK_ANALYSIS_2026-10-08.pl.md). [Szkic odpowiedzi](apple-review-response-draft-2026-10-08.en.md) pozostaje niewysłany i zawiera tylko jawne miejsca wymagające dowodu.
