import { StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Host, Form, Section, Text, Button } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';

export default function CheckEmailScreen() {
  const { statusBarStyle } = useAppTheme();
  const { email, mode } = useLocalSearchParams<{ email?: string; mode?: 'signup' | 'recovery' }>();
  const isRecovery = mode === 'recovery';

  return (
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <StatusBar style={statusBarStyle} />
      <Form modifiers={[padding({ horizontal: 12, top: 12 })]}>
        <Section title={isRecovery ? 'Sprawdź e-mail resetu' : 'Potwierdź e-mail'}>
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
            {isRecovery
              ? `Wysłaliśmy link do resetu hasła na ${email ?? 'podany adres'}. Otwórz go na tym urządzeniu.`
              : `Wysłaliśmy link aktywacyjny na ${email ?? 'podany adres'}. Kliknij link, aby aktywować konto.`}
          </Text>
          <Button label="Wróć do logowania" onPress={() => router.replace('/(auth)/login')} />
          <Button label="Nie masz konta? Zarejestruj się" onPress={() => router.replace('/(auth)/register')} />
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
