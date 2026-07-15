export const MINIMUM_AGE = 16;
export const AGE_POLICY_VERSION = '2026-07-15';

type DateParts = { year: number; month: number; day: number };

function parseIsoDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

export function isValidBirthDate(value: string, referenceDate = new Date()): boolean {
  const parts = parseIsoDate(value);
  if (!parts) return false;
  const birthDate = new Date(parts.year, parts.month - 1, parts.day, 12);
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12);
  return birthDate <= today;
}

export function isAtLeastMinimumAge(value: string, referenceDate = new Date()): boolean {
  const parts = parseIsoDate(value);
  if (!parts || !isValidBirthDate(value, referenceDate)) return false;
  const thresholdYear = referenceDate.getFullYear() - MINIMUM_AGE;
  const threshold = new Date(thresholdYear, referenceDate.getMonth(), referenceDate.getDate(), 12);
  const birthDate = new Date(parts.year, parts.month - 1, parts.day, 12);
  return birthDate <= threshold;
}
