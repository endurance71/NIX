# iOS checklist: ochrona screenshot/nagrywania w Viewerze

> Ten dokument dotyczy **iOS**. Na Androidzie ten sam flow produktowy weryfikuj osobno (`expo-screen-capture`) — patrz [capture-protection.md](capture-protection.md) i [native-platform-guidelines.md](native-platform-guidelines.md).

## Wymagania wstępne
- Build na fizycznym iPhonie (nie tylko simulator).
- Konto A i konto B jako znajomi.
- Konto A wysyła NiXa do konta B.

## Scenariusze
1. **Default deny (bez ustawienia per friend)**  
   Odbiorca B otwiera `viewer` dla NiXa od A:
   - screenshot jest blokowany lub maskowany,
   - pojawia się toast o próbie screenshotu,
   - telemetry zawiera `viewer_capture_block_enabled` i `viewer_capture_attempt`.

2. **Allow per friend**  
   B w profilu znajomych włącza „Zezwalaj na screenshoty od @A”, potem otwiera viewer:
   - screenshot jest dozwolony,
   - telemetry zawiera `viewer_capture_policy_allow`,
   - brak aktywnej blokady po wejściu na viewer.

3. **Powrót na deny**  
   B wyłącza przełącznik i ponownie otwiera viewer:
   - blokada capture wraca,
   - toast pojawia się po próbie screenshotu.

4. **App switcher / background blur**  
   Przy policy `deny` podczas oglądania viewer:
   - przejście do app switchera pokazuje zamaskowany podgląd,
   - po powrocie do aplikacji maska znika.

5. **Brak wycieku poza viewer**  
   Po wyjściu z viewer na inne ekrany:
   - screenshot działa normalnie,
   - nie ma aktywnej blokady globalnej.

## Dodatkowe uwagi
- Jeśli testujesz screenshot callback na Android <14, wymagane są dodatkowe permissiony; ten checklist dotyczy iOS.
