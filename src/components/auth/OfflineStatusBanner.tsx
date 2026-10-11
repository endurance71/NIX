import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppIcon } from '../ui/app-icon';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export function OfflineStatusBanner({
  compact = false,
  style,
}: {
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { isOfflineAuthenticated } = useAuth();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  if (!isOfflineAuthenticated) return null;

  const label = t(compact ? 'root.offlineCompact' : 'root.offlineCachedBanner');
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.container,
        compact && styles.compact,
        {
          backgroundColor: `${colors.accent}1F`,
          borderColor: `${colors.accent}52`,
        },
        style,
      ]}>
      <AppIcon name="warning" size={compact ? 14 : 16} color={colors.accentText} />
      <Text
        maxFontSizeMultiplier={1.4}
        numberOfLines={compact ? 1 : undefined}
        style={[styles.label, compact && styles.compactLabel, { color: colors.accentText }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  compact: {
    minHeight: 32,
    alignSelf: 'center',
    marginVertical: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  label: {
    ...typography.footnote,
    flex: 1,
    flexShrink: 1,
    fontWeight: '600',
  },
  compactLabel: {
    flex: 0,
    ...typography.caption,
    fontWeight: '600',
  },
});
