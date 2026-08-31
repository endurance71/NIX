type AuthenticationResult = {
  error: Error | { message: string } | null;
};

type AppleAuthorizationResult = {
  authorizationCode: string | null;
  error: Error | { message: string } | null;
};

type AccountDeletionReauthentication = {
  hasPassword: boolean;
  hasApple: boolean;
  email: string | null | undefined;
  password: string;
  signIn: (email: string, password: string) => Promise<AuthenticationResult>;
  requestAppleAuthorization: () => Promise<AppleAuthorizationResult>;
};

export async function reauthenticateForAccountDeletion({
  hasPassword,
  hasApple,
  email,
  password,
  signIn,
  requestAppleAuthorization,
}: AccountDeletionReauthentication) {
  if (hasPassword && email) {
    const { error } = await signIn(email, password);
    if (error) throw error;
  }

  if (hasApple) {
    const result = await requestAppleAuthorization();
    if (result.error) throw result.error;
    if (!result.authorizationCode) {
      throw new Error('APPLE_SIGN_IN_NO_AUTHORIZATION_CODE');
    }
    return { appleAuthorizationCode: result.authorizationCode };
  }

  return { appleAuthorizationCode: null };
}
