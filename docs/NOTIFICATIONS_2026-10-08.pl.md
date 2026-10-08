# Powiadomienia NiX — 8 października 2026

Wszystkie dotychczasowe komunikaty `appNotify` korzystają z nowej karty i animacji. Poprzedni pakiet, provider, typy i pod Toast zostały usunięte. Powiadomienia systemowe push, Live Activities i okna potwierdzania zachowują dotychczasową obsługę.

## Wygląd i obsługa

Karta używa jasnego lub ciemnego motywu NiX, SF Pro Rounded, ikony rodzaju komunikatu po lewej oraz zaokrąglenia 28 pkt. Ma boczne marginesy 16 pkt i maksymalną szerokość 396 pkt. Tytuł ma 17 pkt, opis 14 pkt; opis nie jest zastępowany pustym wierszem. Ukryty pomiar treści wyznacza wysokość; przy bardzo dużym tekście karta mieści się w ekranie i pozwala przewijać treść.

Geometria, filtr i parametry sekwencji animacji pochodzą z [expo-dynamic-notifications](https://github.com/rit3zh/expo-dynamic-notifications/tree/5de059a5cbefbe28c14efbe785166665a7c70bc5), commit `5de059a5cbefbe28c14efbe785166665a7c70bc5`. Zachowano licencję MIT w `src/components/notifications/vendor/LICENSE`. Przeniesiono tylko matematykę, geometrię i stałe ruchu; kolejka, provider, wygląd, dostępność i gesty są kodem NiX. Skia jest przypięta do wersji 2.6.2 i ma jawnie dozwolony skrypt instalacji tej wersji.

Animacja wykorzystuje geometrię górnego safe area w portretowej aplikacji na iPhone. Inset mniejszy niż 59 pkt wybiera zwykły baner bez rysowania dodatkowej wyspy; jest to reguła układu, a nie API identyfikujące sprzęt. Nieaktywna nakładka nie rysuje kapsuły. Przy Reduce Motion występuje wyłącznie krótki fade. Karta jest wyświetlana nad natywnymi arkuszami przez FullWindowOverlay i nie przechwytuje dotyku poza swoją powierzchnią.

Sukces, ostrzeżenie i informacja pozostają przez 4 sekundy, błąd przez 5 sekund, liczone od ujawnienia treści. Dotknięcie lub przesunięcie w górę zamyka kartę. Kolejka mieści jeden komunikat widoczny i dwa oczekujące; przepełnienie usuwa najstarszy oczekujący. Powtórzenia tego samego rodzaju, tytułu i opisu w ciągu dwóch sekund są scalane bez przedłużania aktualnego czasu.

Przy VoiceOver automatyczne zamykanie jest wyłączone. Karta ogłasza pełną treść, obsługuje podwójne dotknięcie, standardowy gest escape i akcję zamknięcia. Haptyka sukcesu, błędu lub ostrzeżenia występuje raz przy ujawnieniu treści. Anulowany gest nie zamyka karty. Zmiana konta, przejście do tła i odmontowanie providera usuwają kolejkę i timery; identyfikator z generacją chroni przed spóźnionymi callbackami.

Funkcje `notifySuccess`, `notifyError`, `notifyWarning`, `notifyInfo`, `notifyShow` i `notifyDomainError` zachowują nazwy oraz istniejące wywołania. Własna konfiguracja obejmuje tytuł, opcjonalny opis, rodzaj, czas, ID i akcję dotknięcia. Przeniesiono polskie komunikaty QR, znajomych oraz ochrony zrzutów ekranu do tłumaczeń PL/EN. Zachowano parametry tłumaczeń błędów domenowych.

## Weryfikacja

- 551 testów w 95 zestawach przechodzi; 54 testy obejmują nową kolejkę, geometrię, feedback, cykl animacji i callbacki gestów. Obejmują m.in. przepełnienie, scalanie, czas od ujawnienia, VoiceOver, zmianę sesji i stare callbacki.
- TypeScript, lint, Knip, Expo Doctor (20/20), zgodność wersji Expo, kontrola audytu zależności i eksport Hermes przeszły.
- React Doctor nie wykazuje nowych problemów względem istniejącego baseline. Jedyny dodany wyjątek dotyczy błędnego zastosowania reguły React Native Dimensions do samodzielnego podglądu HTML używającego DOM/clientWidth. Kod aplikacji nie dostał nowego wyjątku ani rozszerzonego baseline.
- Xcode: **BUILD SUCCEEDED**, Debug, symulator, arm64 i x86_64. Pierwszą kontrolę wykonano bez podpisywania; build uruchomiony w symulatorze ma lokalny podpis ad hoc i wygenerowany przez Xcode identyfikator aplikacji wymagany przez Keychain. Kandydat pozostaje 1.0.12 (7). Wynik: `/tmp/nix-stabilization-derived/Build/Products/Debug-iphonesimulator/NiX.app`.
- W `package.json`, lockfile, kodzie aplikacji i Podfile.lock nie pozostał poprzedni mechanizm powiadomień. Dotychczasowe zmiany stabilizacyjne pozostają zachowane.

Audyt npm pokazuje 23 wpisy high, 0 critical. Nadal są to dwa wcześniej przejrzane źródłowe advisory: [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) i [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv). Wzrost z 22 do 23 wynika z wpisu Skia zależnego od React Native w grafie npm; nie doszło nowe źródłowe advisory ani nowa zainstalowana lokalizacja podatnych pakietów. Nie zmieniono listy wyjątków bezpieczeństwa; surowy npm audit nadal ujawnia te wpisy.

Szczegóły i hashe: [zapis walidacji](audit-evidence/2026-10-08-notifications-checks.json).

## Podgląd i granice QA

[Interaktywny podgląd projektu](previews/notifications.html) jest samodzielnym plikiem bez zewnętrznych zasobów. Pozwala zmieniać motyw, rodzaj komunikatu, PL/EN, długość tekstu, wielkość czcionki, wariant ekranu i Reduce Motion. Korzysta z geometrii i palety kodu NiX. Jego składnia oraz sterowanie i timery zostały sprawdzone w mock DOM. Nie stanowi zrzutu aplikacji ani dowodu natywnego lub wizualnego QA.

Zainstalowano runtime iOS 27 (24A434) i uruchomiono NiX na symulatorze iPhone 18 Pro. Potwierdzono widoczny ekran logowania, poprawny odczyt Keychain i wynik `anonymous` podczas uruchamiania autoryzacji. Metro działa na `127.0.0.1:8081`; nie logowano konta. Zrzut ekranu i hashe zapisano w dowodach walidacji.

Uruchomiono również NiX 1.0.12 (7) na fizycznym **iPhone (Damian)** — iPhone 16 Pro Max, iOS 27.0.1 (24A446). Build Debug dla `iphoneos` zakończył się sukcesem; zweryfikowano podpis Apple Development oraz instalację na urządzeniu. Potwierdzono widoczny ekran Skrzynki, odczyt istniejącej sesji i stan `readyOnline`. Metro jest dostępne dla telefonu przez lokalną sieć pod `192.168.1.91:8081`. To sprawdzenie uruchomienia aplikacji, a nie pełne QA powiadomień.

Przed uruchomieniem włączono wspieraną przez obecne Expo 57 opcję `ios.enableSceneSupport`, dodano manifest sceny i przeniesiono tworzenie okna oraz start React Native do wbudowanego `EXExpoAppSceneDelegate`. Kontrola konfiguracji iOS sprawdza tę integrację. Jest to wymagane dla aplikacji budowanych z iOS 27 SDK; [instrukcja Expo](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27).

Po informacji użytkownika o niewłaściwym efekcie przywrócono sekwencję kapsuła → kropla → karta → kapsuła według upstream. Pierwotna implementacja skracała drop/expand, ujawniała treść wcześniej i miała obrys pełnej karty podczas formowania kropli. Obecnie drop trwa 1150 ms, expand 1000 ms z opóźnieniem 340 ms, reveal i tint używają sprężyn 700 ms, a powrót 1150 ms. Treść zachowuje skalę i overshoot źródła; border pojawia się dopiero przy końcu reveal. Karta w wariancie morph ma odstęp 34 pkt od dolnej krawędzi kapsuły. Animacja zaczyna się po zdarzeniu layoutu natywnego kontenera; nie jest to formalna gwarancja pierwszej klatki GPU.

Na symulatorze iPhone 18 Pro / iOS 27 potwierdzono inset 62 pkt i Reduce Motion=false. Nagranie natywnej aplikacji potwierdza pierwsze wyłonienie z kapsuły, rozwinięcie i automatyczny powrót. Sprawdzono także dłuższe komunikaty PL/EN, jasny i ciemny motyw, tap oraz kartę nad natywnym arkuszem. Przy widocznej karcie przycisk poza kartą zamknął arkusz; komunikat pozostał widoczny i można było zamknąć go dotknięciem. Tymczasowy ekran QA usunięto, przywrócono motyw systemowy. Walidacja dotyczy Debug z Metro, a nie pomiaru płynności wersji Release.

Po poprawce ponownie przeszły TypeScript, lint, Knip, React Doctor względem baseline, pełny zestaw testów i eksport Hermes. Zmiana dotyczy wyłącznie JS; korzysta z wcześniej zweryfikowanego natywnego binarium ze Skia. Nie wykonano kolejnej kompilacji natywnej dla tej korekty. Fizyczny iPhone Damiana podczas tej walidacji był niedostępny dla Xcode; wcześniejsze uruchomienie aplikacji pozostaje potwierdzone, ale nowego efektu na nim jeszcze nie sprawdzono.

Nie wykonano pełnej macierzy QA. Przed publikacją pozostają: rzeczywisty swipe w górę, fizyczny iPhone z wyspą i model bez niej, duży tekst, VoiceOver, Reduce Motion, klawiatura, aparat i viewer. Narzędzie sterowania oknem zwracało `noWindowsAvailable` dla współrzędnych gestu; testy callbacków nie zastępują testu przesunięcia na urządzeniu.

Skia wymaga nowego natywnego buildu; zmiany nie są przeznaczone do OTA dla starszego binarium. Nie wykonano publikacji, uploadu do App Store Connect ani zmian w produkcji.
