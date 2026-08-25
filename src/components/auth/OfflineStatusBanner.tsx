import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppIcon } from '../ui/app-icon';
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
      <AppIcon name="warning" size={compact ? 14 : 16} color={colors.accent} />
      <Text
        maxFontSizeMultiplier={1.4}
        numberOfLines={compact ? 1 : undefined}
        style={[styles.label, compact && styles.compactLabel, { color: colors.accent }]}>
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
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
  },
  compact: {
    minHeight: 32,
    alignSelf: 'center',
    marginVertical: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  label: {
    ...typography.footnote,
    flex: 1,
    flexShrink: 1,
    fontWeight: '600',
  },
  compactLabel: {
    flex: 0,
    fontSize: 12,
    lineHeight: 16,
  },
});
