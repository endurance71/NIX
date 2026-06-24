import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { FieldGroup, useNativeState } from '@expo/ui';
import { isUsernameTaken, saveUsernameForCurrentUser } from '../../services/profileService';
import {
  AuthErrorText,
  AuthFormLayout,
  AuthFormHeader,
  AuthFormFooter,
  AuthPrimaryButton,
  AuthTertiaryText,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { notifyDomainError } from '../../lib/appNotify';
import { normalizeUsername } from '../../services/friendService';
import { runWithFinally } from '../../lib/runWithFinally';

export default function OnboardingScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const username = useNativeState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentWidth = Math.max(260, windowWidth - 56);

  const clearError = () => {
    setError(null);
  };

  const handleSetUsername = async () => {
    const cleaned = normalizeUsername(username.value);
    if (cleaned.length < 3) {
      setError('Nazwa użytkownika musi mieć co najmniej 3 znaki (litery, cyfry, _)');
      return;
    }

    setLoading(true);
    setError(null);

    await runWithFinally(
      async () => {
        const taken = await isUsernameTaken(cleaned);
        if (taken) {
          setError('Ta nazwa jest już zajęta. Wybierz inną.');
          return;
        }

        await saveUsernameForCurrentUser(cleaned);
        router.replace('/(tabs)');
      },
      () => setLoading(false)
    ).catch((err: unknown) => {
      notifyDomainError(err, 'Nie udało się zapisać nazwy użytkownika.');
    });
  };

  return (
    <AuthFormLayout>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader
            title="Twój NiX ID"
            description="Wybierz unikalną nazwę. Nie można jej później zmienić."
          />
        </FieldGroup.SectionHeader>

        <AuthTextField
          nativeValue={username}
          placeholder="nazwa_uzytkownika"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={clearError}
        />

        <FieldGroup.SectionFooter>
          <AuthFormFooter>
            <AuthTertiaryText>Dozwolone: litery, cyfry i podkreślenie.</AuthTertiaryText>
            {error ? <AuthErrorText>{error}</AuthErrorText> : null}
            <AuthPrimaryButton
              label={loading ? 'Zapisywanie...' : 'Zapisz nazwę'}
              onPress={() => void handleSetUsername()}
              disabled={loading}
              style={{ width: contentWidth }}
            />
          </AuthFormFooter>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
    </AuthFormLayout>
  );
}

