type AuthLikeError = { code?: unknown; message?: unknown } | null | undefined;

const errorKeys = new Map([
  ['invalid_credentials', 'auth.invalidCredentials'],
  ['email_not_confirmed', 'auth.emailNotConfirmed'],
  ['user_already_exists', 'auth.accountExists'],
  ['email_exists', 'auth.accountExists'],
  ['weak_password', 'auth.passwordMin'],
  ['email_address_invalid', 'auth.invalidEmail'],
  ['otp_expired', 'profile.invalidCodeError'],
  ['over_email_send_rate_limit', 'auth.rateLimited'],
  ['over_request_rate_limit', 'auth.rateLimited'],
  ['USERNAME_TAKEN', 'auth.onboardingUsernameTaken'],
]);

// Older Auth responses may omit the code. Keep their known wording localized too.
const legacyErrors: readonly (readonly [RegExp, string])[] = [
  [/invalid login credentials/i, 'auth.invalidCredentials'],
  [/email not confirmed/i, 'auth.emailNotConfirmed'],
  [/user already registered/i, 'auth.accountExists'],
  [/password should be at least/i, 'auth.passwordMin'],
  [/token has expired or is invalid/i, 'profile.invalidCodeError'],
  [/rate limit|too many requests/i, 'auth.rateLimited'],
];

/** i18n key for an Auth/profile error shown on the sign-in, sign-up and recovery forms. */
export function getAuthFormErrorKey(error: AuthLikeError): string {
  const code = typeof error?.code === 'string' ? error.code : '';
  const codeKey = errorKeys.get(code);
  if (codeKey) return codeKey;
  const message = typeof error?.message === 'string' ? error.message : '';
  const legacyKey = legacyErrors.find(([pattern]) => pattern.test(message))?.[1];
  return legacyKey ?? 'auth.requestFailed';
}
