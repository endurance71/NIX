import Graphemer from 'graphemer';

const splitter = new Graphemer();

/**
 * Normalizuje i waliduje pojedynczy grapheme-cluster (jedno „znakowe” emoji lub symbol).
 */
export function normalizeAvatarEmoji(raw: string): string {
  const trimmed = raw.trim().normalize('NFC');
  if (!trimmed) {
    throw new Error('Podaj jedno emoji.');
  }
  const graphemes = splitter.splitGraphemes(trimmed);
  if (graphemes.length !== 1) {
    throw new Error('Możesz ustawić tylko jedno emoji.');
  }
  return graphemes[0]!;
}
