import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import Animated, { withTiming, type EntryAnimationsValues } from 'react-native-reanimated';
import { useAppTheme } from '../../hooks/useAppTheme';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';
import { duration, useMotionEnabled } from '../../theme/motion';
import { typography } from '../../theme/typography';

/** Rises from the composer by translation only: no opacity on a GlassView ancestor. */
function riseIn(_values: EntryAnimationsValues) {
  'worklet';
  return {
    initialValues: { transform: [{ translateY: 14 }] },
    animations: { transform: [{ translateY: withTiming(0, { duration: duration.fast }) }] },
  };
}

/**
 * What the next send does, above the composer: „Odpowiedź: Anna — Idziemy jutro?” or „Edytowanie
 * wiadomości”, with a clear button. A thin accent rule marks it as context, like a quote in Mail.
 */
export function ComposerContextBar({
  icon,
  title,
  snippet,
  cancelLabel,
  onCancel,
}: {
  icon: AppIconName;
  title: string;
  snippet: string;
  cancelLabel: string;
  onCancel: () => void;
}) {
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const useGlass = canUseLiquidGlass();
  const content = (
    <View style={styles.content}>
      <View style={[styles.rule, { backgroundColor: colors.accent }]} />
      <SymbolView name={resolveAppIconName(icon)} size={APP_ICON_SIZE.sm} tintColor={colors.accentText} weight="semibold" />
      <View
        style={styles.texts}
        accessible
        accessibilityLabel={snippet ? `${title}: ${snippet}` : title}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.label }]}>
          {title}
        </Text>
        {snippet ? (
          <Text numberOfLines={1} style={[styles.snippet, { color: colors.secondaryLabel }]}>
            {snippet}
          </Text>
        ) : null}
      </View>
      <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" accessibilityLabel={cancelLabel}>
        <SymbolView
          name={resolveAppIconName('clearText')}
          size={APP_ICON_SIZE.lg}
          tintColor={colors.tertiaryLabel}
          weight="regular"
        />
      </Pressable>
    </View>
  );
  return (
    <Animated.View entering={motionEnabled ? riseIn : undefined} style={styles.shell}>
      {useGlass ? (
        <GlassView style={styles.bar} glassEffectStyle="regular">
          {content}
        </GlassView>
      ) : (
        <View style={[styles.bar, { backgroundColor: colors.secondarySystemFill }]}>{content}</View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: 8,
  },
  bar: {
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 12,
  },
  rule: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 1.5,
  },
  texts: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...typography.footnote,
    fontWeight: '600',
  },
  snippet: {
    ...typography.footnote,
  },
});
