# NiX 1.0.9 (1) — What to Test (Internal)

Udostępniane linki zaproszeń są w tym buildzie celowo wyłączone. Nie testujemy
landingu, AASA ani realizacji tokenów `share`; QR i dodawanie po username nadal
wchodzą w zakres regresji.

Audience: members of **NiX Internal QA** only. Do not submit this build for
external Beta App Review.

## Naklejki i rysowanie — dwa konta i dwa iPhone’y

- Zrób zdjęcie, dodaj naklejkę tekstową i sprawdź klawiaturę, przeciąganie,
  zamknięcie przez overlay, usuwanie oraz formatowanie bez przeskoków UI.
- Sprawdź każdy preset tekstu, wyrównanie, styl, kolor tekstu i kolor belki,
  w tym „Bez belki”; domyślny tekst ma być czarny, a biała belka półprzezroczysta.
- Narysuj kilka linii różnymi narzędziami, sprawdź undo/redo, anulowanie i
  zatwierdzenie. Przejście headera ma być płynnym crossfade bez błędnej klatki.
- Zapisz zdjęcie do galerii i wyślij je drugiemu kontu. Preview, zapisane medium
  i widok odbiorcy muszą mieć zgodną geometrię, kolor i przezroczystość naklejki.
- Powtórz dla krótkiego wideo i wielu segmentów. Kolejność segmentów musi zostać
  zachowana, a częściowy błąd bake nie może zapisać niepełnego zestawu.
- Po błędzie lub anulowaniu ponów zapis/wysyłkę i potwierdź brak błędu bridge,
  osieroconych plików tymczasowych, crasha oraz podwójnego wysłania.

## Roadmap — dwa konta i dwa iPhone’y

- Skrzynka: wyszukaj po nazwie i `@username`, także inną wielkością liter i bez
  znaków diakrytycznych; sprawdź pusty stan.
- Unread: tekst zwiększa badge tylko odbiorcy, wejście do rozmowy go zeruje,
  nadawca nie widzi potwierdzenia odczytu, a wspólny badge kończy się na `99+`.
- Outbox: wyślij tekst offline, uruchom aplikację ponownie i odzyskaj sieć.
  Wiadomość ma zostać wysłana dokładnie raz. Sprawdź „Ponów”, „Usuń”, czyszczenie
  po 24 godzinach i po zmianie konta.
- Znajomi: dodaj drugie konto po `@username` oraz przez QR; udostępniany link
  nie może być widoczny ani obsługiwany.
- Aktywacja: dodaj pierwszego znajomego, wyślij pierwszy NiX i potwierdź
  automatyczne ukończenie. Sprawdź pominięcie oraz checklistę w Profilu.
- Analityka: przed opt-in nie może powstać event; po zgodzie zapisywane są tylko
  dozwolone eventy bez treści, username, tokenów i identyfikatorów konta.
- Powiadomienia: sprawdź mute 1h, 24h i bezterminowy, każdą kategorię i globalny
  przełącznik urządzenia. Alert capture ma pozostać aktywny.
- Urządzenia: bieżący iPhone pozostaje zalogowany, „Wyloguj pozostałe” unieważnia
  drugi refresh token i wyłącza jego push.
- Eksport: jeden aktywny job, limit 24h, reautoryzacja, prywatny signed URL,
  manifest SHA-256 i brak cudzych, wygasłych lub tajnych danych. Archiwum ma
  przestać być dostępne po 24h.

## UI i regresja

- PL/EN, jasny/ciemny motyw, większy Dynamic Type i VoiceOver.
- Profil: kod QR po lewej i ołówek edycji po prawej, z równym rozmiarem,
  hit area, haptics i poprawną nawigacją.
- Edycja profilu: nazwa wymagana po trimie i maksymalnie 50 znaków; opcjonalny
  opis maksymalnie 140 znaków; sprawdź zapis, anulowanie, ponowne otwarcie,
  tryb offline i błąd sieci.
- Awatar: aparat, biblioteka, kadrowanie 1:1, anulowanie, odmowa uprawnień,
  ponowne przyznanie oraz usunięcie zdjęcia.
- Prywatność opisu: `bio` widzi zaakceptowany znajomy, ale nie wyszukiwanie,
  podgląd QR ani oczekujące zaproszenie.
- Rejestracja i reset hasła: transparentny header, sam chevron wstecz i brak
  nakładania checkboxa na przycisk.
- Profil: spójne SF Symbols, maksymalnie trzy wiersze głównych ustawień.
- Kamera, zdjęcie/wideo, galeria, podgląd i wysłanie do jednego oraz kilku odbiorców.
- Trwały upload po blokadzie ekranu, utracie sieci, restarcie procesu i restarcie telefonu.
- Raportowanie, blokowanie, odblokowanie i usunięcie konta nadal działają.

## Warunek GO

Zablokuj rollout przy każdym crashu P0, błędzie bake/bridge, różnicy między
preview i medium odbiorcy, utracie lub duplikacji wiadomości, nieautoryzowanym
odczycie, wycieku tokenu zaproszenia, cudzym eksporcie albo wysłaniu push mimo
blokady/mute.
