import Stack from 'expo-router/stack';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useAuth } from '../../../hooks/useAuth';
import { APP_FONT_FAMILY } from '../../../theme/typography';
import { SOFT_SCROLL_EDGE_EFFECTS } from '../../../theme/scrollEdge';

export default function InboxTabLayout() {
  const { colors } = useAppTheme();
  const { isOfflineAuthenticated } = useAuth();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitleEnabled: true,
        headerTintColor: colors.accentText,
        headerTransparent: !isOfflineAuthenticated,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: isOfflineAuthenticated ? colors.background : 'transparent' },
        headerLargeStyle: { backgroundColor: isOfflineAuthenticated ? colors.background : 'transparent' },
        headerTitleStyle: { fontFamily: APP_FONT_FAMILY, fontWeight: '700', color: colors.label },
        headerLargeTitleStyle: { fontFamily: APP_FONT_FAMILY, fontWeight: '700', color: colors.label },
        contentStyle: { backgroundColor: colors.background },
        scrollEdgeEffects: SOFT_SCROLL_EDGE_EFFECTS,
      }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
