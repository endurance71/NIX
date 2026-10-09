import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { AppNotification, NotificationKind } from '../../lib/notificationQueue';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../../theme/typography';

const symbols: Record<NotificationKind, SFSymbol> = {
  success: 'checkmark.circle.fill',
  error: 'xmark.circle.fill',
  warning: 'exclamationmark.triangle.fill',
  info: 'info.circle.fill',
};

export function NotificationCardBody({ notification }: { notification: AppNotification }) {
  const { colors } = useAppTheme();
  const accent = colors[notification.kind];
  return (
    <View style={styles.body}>
      <View style={[styles.icon, { backgroundColor: `${accent}18` }]} accessibilityElementsHidden>
        <SymbolView name={symbols[notification.kind]} tintColor={accent} size={25} weight="semibold" />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{notification.title}</Text>
        {notification.message ? (
          <Text style={[styles.message, { color: colors.textPrimary }]}>{notification.message}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, minHeight: 72 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 3 },
  title: { fontFamily: APP_FONT_FAMILY, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  message: { fontFamily: APP_FONT_FAMILY, fontSize: 14, lineHeight: 19, fontWeight: '400', opacity: 0.7 },
});
