import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_ICON_SIZE, type AppIconName } from '../../theme/app-icons';
import { pressScaleTo, useMotionEnabled } from '../../theme/motion';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { AppIcon } from './app-icon';
import {
  BUTTON_DISABLED_OPACITY,
  BUTTON_HEIGHT,
  BUTTON_RADIUS,
  isButtonInteractive,
  resolveButtonAppearance,
  type ButtonSize,
  type ButtonVariant,
} from './button-appearance';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading SF Symbol from the `AppIcon` registry. */
  icon?: AppIconName;
  /**
   * Leading spinner (in place of `icon`), blocks presses and announces the button as busy.
   * Pass a progress title (e.g. „Zabezpieczanie…”) when the action takes a while.
   */
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the parent's width; otherwise the button hugs its content and centers itself. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  /** Outer layout only (margins, flex). Colors, height and radius come from the variant. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The one NiX text button. RN-hosted (not SwiftUI `Button`) because it sits in RN layouts that
 * need reliable full width, a fixed 44/52 pt height and a 14 pt continuous corner — and it can
 * also be embedded in a SwiftUI tree through `RNHostView` (see `AuthPrimaryButton`).
 * Haptics stay at the call site: they belong to the action's outcome, not to the tap.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'regular',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  const interactive = isButtonInteractive(disabled, loading);
  const { backgroundColor, foregroundColor } = resolveButtonAppearance(variant, colors);
  const height = BUTTON_HEIGHT[size];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !interactive, busy: loading }}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { minHeight: height, backgroundColor },
        fullWidth ? styles.fullWidth : styles.hug,
        disabled && !loading ? styles.disabled : null,
        pressed && interactive ? styles.pressed : null,
        pressed && interactive && motionEnabled ? styles.pressedScale : null,
        style,
      ]}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={foregroundColor} />
        ) : icon ? (
          <AppIcon name={icon} size={APP_ICON_SIZE.md} color={foregroundColor} />
        ) : null}
        <Text numberOfLines={2} style={[styles.title, { color: foregroundColor }]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BUTTON_RADIUS,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.xl,
    // Lets a title wrapped by large Dynamic Type grow the button instead of touching its edges.
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  hug: {
    alignSelf: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  title: {
    ...typography.headline,
    textAlign: 'center',
    flexShrink: 1,
  },
  disabled: {
    opacity: BUTTON_DISABLED_OPACITY,
  },
  pressed: {
    opacity: 0.85,
  },
  pressedScale: {
    transform: [{ scale: pressScaleTo }],
  },
});
