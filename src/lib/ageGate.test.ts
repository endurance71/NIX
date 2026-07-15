import { describe, expect, it } from 'vitest';
import { isAtLeastMinimumAge, isValidBirthDate } from './ageGate';

const reference = new Date(2026, 6, 15, 12);

describe('ageGate', () => {
  it('akceptuje osobę dokładnie w dniu 16. urodzin', () => {
    expect(isAtLeastMinimumAge('2010-07-15', reference)).toBe(true);
  });

  it('odrzuca osobę dzień przed 16. urodzinami', () => {
    expect(isAtLeastMinimumAge('2010-07-16', reference)).toBe(false);
  });

  it('odrzuca datę przyszłą, niepoprawną i format zależny od locale', () => {
    expect(isValidBirthDate('2027-01-01', reference)).toBe(false);
    expect(isValidBirthDate('2010-02-30', reference)).toBe(false);
    expect(isValidBirthDate('15.07.2010', reference)).toBe(false);
  });

  it('obsługuje datę urodzenia 29 lutego bez konwersji UTC', () => {
    expect(isAtLeastMinimumAge('2008-02-29', new Date(2024, 1, 29, 12))).toBe(true);
  });
});
