import { router, useLocalSearchParams } from 'expo-router';
import {
  AuthFormLayout,
  AuthFormSection,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthSecondaryText,
} from '../../components/ui/auth-form-layout';

export default function CheckEmailScreen() {
  const { email, mode } = useLocalSearchParams<{ email?: string; mode?: 'signup' | 'recovery' }>();
  const isRecovery = mode === 'recovery';

  return (
    <AuthFormLayout>
      <AuthFormSection title={isRecovery ? 'Sprawdź e-mail resetu' : 'Potwierdź e-mail'}>
        <AuthSecondaryText>
          {isRecovery
            ? `Wysłaliśmy link do resetu hasła na ${email ?? 'podany adres'}. Otwórz go na tym urządzeniu.`
            : `Wysłaliśmy link aktywacyjny na ${email ?? 'podany adres'}. Kliknij link, aby aktywować konto.`}
        </AuthSecondaryText>
        <AuthPrimaryButton label="Wróć do logowania" onPress={() => router.replace('/(auth)/login')} />
        <AuthSecondaryButton
          label="Nie masz konta? Zarejestruj się"
          onPress={() => router.replace('/(auth)/register')}
        />
      </AuthFormSection>
    </AuthFormLayout>
  );
}
