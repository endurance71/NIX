import { useCallback, useState } from 'react';
import { AppState, Button, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import { notifyShow } from '../lib/appNotify';
import { appNotificationQueue } from '../lib/notificationQueue';
import { APP_FONT_FAMILY } from '../theme/typography';

const PREVIEW_ID = 'notification-preview-';

function showPreview() {
  if (AppState.currentState !== 'active' || appNotificationQueue.getSnapshot().phase !== 'idle') return;
  notifyShow({ id: `${PREVIEW_ID}${Date.now()}`, kind: 'success', title: 'Gotowe', message: 'Tak wygląda nowe powiadomienie NiX.' });
}

function dismissPreview() {
  const { notification, generation } = appNotificationQueue.getSnapshot();
  if (notification?.id.startsWith(PREVIEW_ID)) {
    appNotificationQueue.dismiss({ id: notification.id, generation });
  }
}

/** Local native presentation surface; production builds immediately leave this route. */
export default function NotificationPreview() {
  return __DEV__ ? <DevelopmentPreview /> : <Redirect href="/" />;
}

function DevelopmentPreview() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [automatic, setAutomatic] = useState(true);
  useFocusEffect(useCallback(() => {
    if (!automatic) return;
    const initial = setTimeout(showPreview, 800);
    const timer = setInterval(showPreview, 8000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      dismissPreview();
    };
  }, [automatic]));
  useFocusEffect(useCallback(() => () => dismissPreview(), []));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 230 }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Powiadomienia NiX</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        Kapsuła → karta → kapsuła. Pokaz powtarza się co 8 sekund. Dotknij powiadomienia lub przesuń je w górę, aby je zamknąć.
      </Text>
      <Button title="Pokaż ponownie" onPress={showPreview} />
      <Button title={automatic ? 'Zatrzymaj pokaz' : 'Włącz pokaz'} onPress={() => setAutomatic((value) => !value)} />
      <Button title="Wróć do aplikacji" onPress={() => router.replace('/(tabs)/inbox')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 28, gap: 24 },
  title: { fontFamily: APP_FONT_FAMILY, fontSize: 24, fontWeight: '600' },
  description: { fontFamily: APP_FONT_FAMILY, fontSize: 16, lineHeight: 24 },
});
