/**
 * Odstępy NiX na siatce 4 pt (Apple HIG: 8 pt rytm, 4 pt półkroki).
 * Używaj do `padding*`, `margin*` i `gap`. Wartości poza siatką (6, 10, 14…) zaokrąglaj do
 * najbliższego tokenu, chyba że wynikają z natywnej geometrii (nav bar, kamera, awatary).
 */
export const spacing = {
  /** Włoskowe odsunięcia: ikona ↔ badge, linia tekstu ↔ podkreślenie. */
  xxs: 2,
  /** Ciasne odstępy w obrębie jednego elementu (etykieta ↔ wartość, ikona ↔ tekst w chipie). */
  xs: 4,
  /** Domyślny odstęp między powiązanymi elementami (wiersze w stosie, ikona ↔ tytuł). */
  sm: 8,
  /** Wewnętrzny padding kompaktowych kontrolek i banerów; odstęp między przyciskami. */
  md: 12,
  /** Margines ekranu (gutter iOS) i padding kart / wierszy. */
  lg: 16,
  /** Odstęp między sekcjami w obrębie karty. */
  xl: 20,
  /** Odstęp między sekcjami ekranu; margines formularzy auth. */
  xxl: 24,
  /** Duże puste pola: ekrany stanów (puste, uprawnienia, błąd startu). */
  xxxl: 32,
} as const;

export type SpacingToken = keyof typeof spacing;
