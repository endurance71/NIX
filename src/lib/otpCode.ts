/** Supabase e-mail codes (`otp_length` in supabase/config.toml). */
export const OTP_CODE_LENGTH = 6;

/** Keeps only digits, at most one code long: pasted "123 456" or "Kod: 123456" both work. */
export function sanitizeOtpCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
}
