import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitle: true,
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Rejestracja', headerLargeTitle: false }} />
      <Stack.Screen name="check-email" options={{ title: 'Sprawdź email', headerLargeTitle: false }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset hasła', headerLargeTitle: false }} />
      <Stack.Screen name="reset-password" options={{ title: 'Nowe hasło', headerLargeTitle: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'Profil', headerLargeTitle: false }} />
    </Stack>
  );
}
