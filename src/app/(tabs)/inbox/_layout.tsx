import Stack from 'expo-router/stack';
import { useAppTheme } from '../../../hooks/useAppTheme';

export default function InboxTabLayout() {
  const { colors } = useAppTheme();
  const isAndroid = process.env.EXPO_OS === 'android';

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitle: !isAndroid,
        headerTransparent: !isAndroid,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: isAndroid ? colors.systemBackground : 'transparent' },
        headerLargeStyle: { backgroundColor: isAndroid ? colors.systemBackground : 'transparent' },
      }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
