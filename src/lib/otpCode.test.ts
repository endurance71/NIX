import { describe, expect, it } from 'vitest';
import { OTP_CODE_LENGTH, sanitizeOtpCode } from './otpCode';

describe('sanitizeOtpCode', () => {
  it('przyjmuje wklejony kod ze spacjami lub opisem', () => {
    expect(sanitizeOtpCode('123 456')).toBe('123456');
    expect(sanitizeOtpCode('Kod: 062562')).toBe('062562');
  });

  it('obcina do długości kodu i odrzuca litery', () => {
    expect(sanitizeOtpCode('12345678')).toHaveLength(OTP_CODE_LENGTH);
    expect(sanitizeOtpCode('abc')).toBe('');
  });
});
