/**
 * Promienie narożników NiX. Zawsze łącz z `borderCurve: 'continuous'` (squircle jak w iOS),
 * poza kapsułami (`pill`). Kontrolki okrągłe o stałym rozmiarze (awatar, migawka, przyciski
 * chrome 44 pt) liczą promień z wymiaru (`size / 2`) i nie używają tych tokenów.
 */
export const radius = {
  /** Badge, checkbox, wewnętrzny (ogonkowy) narożnik dymka czatu. */
  xs: 6,
  /** Małe pola i miniatury w gęstych siatkach. */
  sm: 8,
  /** Kafelki, pola wyszukiwania, komórki emoji, HUD-y nad mediami. */
  md: 12,
  /** Przyciski wypełnione (`Button`, Sign in with Apple) i grupy pól auth. */
  button: 14,
  /** Banery (offline, błąd startu) i kontrolki w arkuszach. */
  lg: 16,
  /** Dymek czatu i kontrolki formatowania tekstu (iMessage). */
  bubble: 18,
  /** Karty i duże powierzchnie (powiadomienie w aplikacji, karta QR). */
  card: 28,
  /** Kapsuła — RN przycina promień do połowy wysokości. */
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;
