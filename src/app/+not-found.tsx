import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { typography } from '../theme/typography';

export default function NotFoundScreen() {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <Text style={[styles.symbol, { color: colors.tertiaryLabel }]}>!</Text>
      <Text style={[styles.title, { color: colors.label }]}>Nie znaleziono widoku</Text>
      <Text selectable style={[styles.message, { color: colors.secondaryLabel }]}>
        Ten adres nie prowadzi do aktywnego ekranu NiX.
      </Text>
      <Pressable
        accessibilityLabel="Wróć do aplikacji"
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.buttonPrimaryBg },
          pressed && styles.pressed,
        ]}
        onPress={() => router.replace('/(tabs)')}
      >
        <Text style={[styles.buttonLabel, { color: colors.buttonPrimaryText }]}>Wróć do aplikacji</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  symbol: {
    ...typography.largeTitle,
    marginBottom: 12,
  },
  title: {
    ...typography.title2,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    minHeight: 44,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonLabel: {
    ...typography.headline,
  },
  pressed: {
    opacity: 0.7,
  },
});
