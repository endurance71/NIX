import { router } from 'expo-router';
import { useState } from 'react';
import { isUsernameTaken, saveUsernameForCurrentUser } from '../../services/profileService';
import {
  AuthErrorText,
  AuthFormLayout,
  AuthFormSection,
  AuthPrimaryButton,
  AuthSecondaryText,
  AuthTertiaryText,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { notifyDomainError, notifyError } from '../../lib/appNotify';
import { normalizeUsername } from '../../services/friendService';
import { runWithFinally } from '../../lib/runWithFinally';

export default function OnboardingScreen() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetUsername = async () => {
    const cleaned = normalizeUsername(username);
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
          notifyError('Ta nazwa jest już zajęta. Wybierz inną.');
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
      <AuthFormSection title="Twój NiX ID">
        <AuthSecondaryText>Wybierz unikalną nazwę. Nie można jej później zmienić.</AuthSecondaryText>
        <AuthTextField
          placeholder="nazwa_uzytkownika"
          value={username}
          onChangeText={(text) => {
            setError(null);
            setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''));
          }}
        />
        <AuthTertiaryText>Dozwolone: litery, cyfry i podkreślenie.</AuthTertiaryText>
        {error ? <AuthErrorText>{error}</AuthErrorText> : null}
        <AuthPrimaryButton
          label={loading ? 'Zapisywanie...' : 'Zapisz nazwę'}
          onPress={handleSetUsername}
          disabled={loading}
        />
      </AuthFormSection>
    </AuthFormLayout>
  );
}
