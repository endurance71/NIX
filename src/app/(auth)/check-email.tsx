import { router, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { FieldGroup } from '@expo/ui';
import {
  AuthFormLayout,
  AuthFormHeader,
  AuthFormFooter,
  AuthPrimaryButton,
  AuthSecondaryButton,
} from '../../components/ui/auth-form-layout';

export default function CheckEmailScreen() {
  const { email, mode } = useLocalSearchParams<{ email?: string; mode?: 'signup' | 'recovery' }>();
  const { width: windowWidth } = useWindowDimensions();
  const isRecovery = mode === 'recovery';

  const contentWidth = Math.max(260, windowWidth - 56);

  const title = isRecovery ? 'Sprawdź e-mail resetu' : 'Potwierdź e-mail';
  const description = isRecovery
    ? `Wysłaliśmy link do resetu hasła na ${email ?? 'podany adres'}. Otwórz go na tym urządzeniu.`
    : `Wysłaliśmy link aktywacyjny na ${email ?? 'podany adres'}. Kliknij link, aby aktywować konto.`;

  return (
    <AuthFormLayout>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader
            title={title}
            description={description}
          />
        </FieldGroup.SectionHeader>

        <FieldGroup.SectionFooter>
          <AuthFormFooter>
            <AuthPrimaryButton
              label="Wróć do logowania"
              onPress={() => router.replace('/(auth)/login')}
              style={{ width: contentWidth }}
            />

            <AuthSecondaryButton
              label="Nie masz konta? Zarejestruj się"
              onPress={() => router.replace('/(auth)/register')}
              style={{ width: contentWidth }}
            />
          </AuthFormFooter>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
    </AuthFormLayout>
  );
}

