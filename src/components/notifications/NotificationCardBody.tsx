import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { AppNotification, NotificationKind } from '../../lib/notificationQueue';
import { useAppTheme } from '../../hooks/useAppTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

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
      <View style={styles.icon} accessibilityElementsHidden>
        {/* Theme accent at ~9% as a separate layer: no hex string arithmetic on theme colors. */}
        <View style={[StyleSheet.absoluteFill, styles.iconTint, { backgroundColor: accent }]} />
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
  body: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md, minHeight: 72 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  iconTint: { opacity: 0.094 },
  copy: { flex: 1, gap: spacing.xxs },
  title: { ...typography.headline },
  message: { ...typography.subheadline, opacity: 0.7 },
});
