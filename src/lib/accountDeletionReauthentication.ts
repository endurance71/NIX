type AuthenticationResult = {
  error: Error | null;
};

type AccountDeletionReauthentication = {
  hasPassword: boolean;
  email: string | null | undefined;
  password: string;
  signIn: (email: string, password: string) => Promise<AuthenticationResult>;
  signInWithApple: () => Promise<AuthenticationResult>;
};

export async function reauthenticateForAccountDeletion({
  hasPassword,
  email,
  password,
  signIn,
  signInWithApple,
}: AccountDeletionReauthentication) {
  const { error } =
    hasPassword && email ? await signIn(email, password) : await signInWithApple();
  if (error) throw error;
}
