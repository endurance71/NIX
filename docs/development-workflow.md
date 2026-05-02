# Przepływ pracy deweloperskiej

## Standard pracy

1. Twórz małe, tematyczne zmiany (stabilizacja -> refaktor -> docs).
2. Przed PR uruchom:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
3. Opisz w PR:
   - zakres zmian,
   - ryzyka,
   - test plan.

## Lista testów dymnych (manualnie)

### Uwierzytelnianie

- [ ] Logowanie: wysłanie OTP na poprawny e-mail.
- [ ] Weryfikacja: poprawny kod prowadzi do onboardingu lub kart.
- [ ] Onboarding: zapis poprawnej, unikalnej nazwy użytkownika.

### Friends

- [ ] Wyszukanie istniejącego użytkownika po `@nazwa_uzytkownika`.
- [ ] Wysłanie zaproszenia do znajomych i brak duplikatu po ponownej próbie.
- [ ] Akceptacja zaproszenia odwrotnego po kliknięciu „Wyślij” dla tego samego użytkownika.
- [ ] Akceptacja i odrzucenie zaproszenia z ekranu profilu.
- [ ] Lista znajomych zawiera zaakceptowane relacje po odświeżeniu.
- [ ] Ekran `send-to` pokazuje tylko zaakceptowanych znajomych.

### Przepływ wiadomości

- [ ] Kamera: wykonanie zdjęcia i przejście do preview.
- [ ] Wyślij-do: lista odbiorców bez mocków; przy braku profili widoczny pusty stan.
- [ ] Przesyłanie: wysłanie wiadomości tworzy rekord w `snaps`.
- [ ] Skrzynka: nowa wiadomość widoczna u odbiorcy.
- [ ] Podgląd: po obejrzeniu wiadomość jest oznaczona jako `is_viewed`.
- [ ] Viewer: po obejrzeniu wywoływane jest `cleanup-snap` i rekord znika z `snaps`.

### Sesja

- [ ] Wylogowanie z profilu kończy sesję i wraca do loginu.
- [ ] Ponowne uruchomienie app respektuje zapisany stan sesji.

## Observability i alerty

Monitoruj cyklicznie:
- `snap_cleanup_queue`:
  - liczba rekordów oczekujących (`next_attempt_at <= now`) > 20 przez 10 min -> alert.
- `snap_cleanup_audit`:
  - udział statusu `failed` > 5% w oknie 15 min -> alert.
- Upload:
  - skoki błędów `INVALID_MEDIA` lub `RATE_LIMITED` > 2x baseline -> alert.

## Runbook: degradacja cleanupu

1. Sprawdź ostatnie wpisy w `snap_cleanup_audit` i kody błędów.
2. Zweryfikuj dostępność Edge Function `cleanup-snap` i sekrety środowiskowe.
3. Jeśli funkcja działa, uruchom ręczny retry kolejki cleanup dla rekordów zaległych.
4. Gdy problem dotyczy Storage/RLS, cofaj ostatnią zmianę polityk i monitoruj trend kolejki.
5. Po stabilizacji potwierdź, że kolejka wróciła do normalnego poziomu.
