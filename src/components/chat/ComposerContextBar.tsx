import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type EntryAnimationsValues,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
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

/** Closing: the glass dematerializes natively while the content sinks back into the composer. */
const CLOSE_MS = 220;
const CLOSE_EASING = Easing.bezier(0.23, 1, 0.32, 1);

export type ComposerContextBarContent = {
  /** A new key is a new banner: it rises in again instead of updating in place. */
  key: string;
  icon: AppIconName;
  title: string;
  snippet: string;
  cancelLabel: string;
};

/**
 * Keeps the last banner on screen after `content` turns null until its close animation ends, so
 * cancelling or sending a reply folds the banner away instead of cutting it.
 */
export function ComposerContextPresence({
  content,
  onCancel,
  style,
}: {
  content: ComposerContextBarContent | null;
  onCancel: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const motionEnabled = useMotionEnabled();
  const [shown, setShown] = useState(content);
  // Adopt a new banner during render (no effect round trip); without motion a close is immediate.
  if (content && content !== shown) setShown(content);
  if (!content && shown && !motionEnabled) setShown(null);
  if (!shown) return null;
  const closing = content === null;
  return (
    <View style={style} pointerEvents={closing ? 'none' : 'auto'}>
      <ComposerContextBar
        key={shown.key}
        icon={shown.icon}
        title={shown.title}
        snippet={shown.snippet}
        cancelLabel={shown.cancelLabel}
        closing={closing}
        onCancel={onCancel}
        onClosed={() => setShown(null)}
      />
    </View>
  );
}

/**
 * What the next send does, above the composer: „Odpowiedź: Anna — Idziemy jutro?” or „Edytowanie
 * wiadomości”, with a clear button. A thin accent rule marks it as context, like a quote in Mail.
 */
function ComposerContextBar({
  icon,
  title,
  snippet,
  cancelLabel,
  closing,
  onCancel,
  onClosed,
}: Omit<ComposerContextBarContent, 'key'> & {
  closing: boolean;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const useGlass = canUseLiquidGlass();
  const close = useSharedValue(0);

  useEffect(() => {
    if (!closing) return;
    close.set(
      withTiming(1, { duration: CLOSE_MS, easing: CLOSE_EASING }, (finished) => {
        if (finished) scheduleOnRN(onClosed);
      }),
    );
  }, [close, closing, onClosed]);

  // Glass: the shell only moves; the content fades inside the glass, which dematerializes itself.
  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: close.get() * 10 }, { scale: 1 - close.get() * 0.04 }],
    opacity: useGlass ? 1 : 1 - close.get(),
  }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - close.get() }));

  const content = (
    <Animated.View style={[styles.content, contentStyle]}>
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
    </Animated.View>
  );
  return (
    <Animated.View entering={motionEnabled ? riseIn : undefined} style={styles.shell}>
      <Animated.View style={shellStyle}>
        {useGlass ? (
          <GlassView
            style={styles.bar}
            glassEffectStyle={
              closing ? { style: 'none', animate: true, animationDuration: CLOSE_MS / 1000 } : 'regular'
            }>
            {content}
          </GlassView>
        ) : (
          <View style={[styles.bar, { backgroundColor: colors.secondarySystemFill }]}>{content}</View>
        )}
      </Animated.View>
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
