import {
  StyleSheet,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { isUsernameTaken, saveUsernameForCurrentUser } from '../../services/profileService';
import { StatusBar } from 'expo-status-bar';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Host, Form, Section, Text, TextField, Button } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  textFieldStyle,
  textInputAutocapitalization,
  autocorrectionDisabled,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { notifyDomainError, notifyError } from '../../lib/appNotify';

export default function OnboardingScreen() {
  const { statusBarStyle } = useAppTheme();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetUsername = async () => {
    const cleaned = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleaned.length < 3) {
      setError('Nazwa użytkownika musi mieć co najmniej 3 znaki (litery, cyfry, _)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const taken = await isUsernameTaken(cleaned);
      if (taken) {
        notifyError('Ta nazwa jest już zajęta. Wybierz inną.');
        return;
      }

      await saveUsernameForCurrentUser(cleaned);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      notifyDomainError(err, 'Nie udało się zapisać nazwy użytkownika.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <StatusBar style={statusBarStyle} />
      <Form modifiers={[padding({ horizontal: 12, top: 12 })]}>
        <Section title="Twój NiX ID">
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
            Wybierz unikalną nazwę. Nie można jej później zmienić.
          </Text>
          <TextField
            placeholder="nazwa_uzytkownika"
            defaultValue={username}
            onValueChange={(t) => {
              setError(null);
              setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''));
            }}
            autoFocus
            modifiers={[
              textFieldStyle('roundedBorder'),
              textInputAutocapitalization('never'),
              autocorrectionDisabled(true),
            ]}
          />
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'tertiary' }), font({ size: 12, design: 'rounded' })]}>
            Dozwolone: litery, cyfry i podkreślenie.
          </Text>

          {error ? <Text modifiers={[foregroundStyle({ type: 'color', color: 'red' }), font({ size: 13, design: 'rounded' })]}>{error}</Text> : null}

          <Button label={loading ? 'Zapisywanie...' : 'Zapisz nazwę'} onPress={handleSetUsername} />
        </Section>
      </Form>
    </Host>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
