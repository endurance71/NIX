import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Host } from '@expo/ui';
import { Button, HStack, Image as SwiftImage, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityHidden,
  accessibilityHint as swiftAccessibilityHint,
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  buttonStyle,
  font,
  foregroundStyle,
  fixedSize,
  frame,
  glassEffect,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  shapes,
  type ModifierConfig,
} from '@expo/ui/swift-ui/modifiers';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';

/** 44 pt: the pill is a touch target whenever it (or its trailing button) is tappable. */
const PILL_MIN_HEIGHT = 44;
const TRAILING_BUTTON_SIZE = 28;

type PillTextStyle = 'callout' | 'footnote' | 'caption';

type NativeGlassPillProps = {
  label: string;
  /** Text and symbols. */
  tintColor: string;
  /**
   * Wash under the glass (legibility over bright media, like the chrome buttons). Below
   * iOS 26 — where `glassEffect` draws nothing — it is the whole capsule.
   */
  fill: string;
  /** Leading SF Symbol (e.g. the red recording dot). */
  leadingIcon?: AppIconName;
  leadingIconColor?: ColorValue;
  leadingIconSize?: number;
  /** A separate trailing button, e.g. „×” that clears the camera's preset recipient. */
  trailingAction?: {
    icon: AppIconName;
    accessibilityLabel: string;
    onPress: () => void;
  } | null;
  /** Makes the whole pill one button (e.g. the dismissable „Hold to record” hint). */
  onPress?: () => void;
  /** Trailing glyph drawn inside a pressable pill (decorative: the label says what it does). */
  trailingIcon?: AppIconName;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Hidden from VoiceOver (the screen announces the same text elsewhere). */
  accessibilityHidden?: boolean;
  textStyle?: PillTextStyle;
  weight?: 'regular' | 'semibold' | 'bold';
  monospacedDigits?: boolean;
  /** Lines before truncation; `0` lets the text wrap (centered), e.g. error messages. */
  numberOfLines?: number;
  /** `undefined`: a capsule. A radius: a rounded rectangle for text that wraps. */
  cornerRadius?: number;
  /** `compact` drops the 44 pt minimum for a non-interactive tag (e.g. „Powtórka”). */
  size?: 'regular' | 'compact';
  /** Cinema surfaces stay dark in both themes. */
  colorScheme?: 'light' | 'dark';
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A native SwiftUI capsule on Liquid Glass: status pills, hints and tags on the camera, viewer
 * and QR scanner. Replaces RN `View`s that imitated glass with a translucent fill.
 * Non-interactive glass for labels; interactive glass only when the pill is a button.
 * Reduce Transparency makes the system glass opaque by itself.
 */
function pillSurfaceModifiers({
  fill,
  cornerRadius,
  compact,
  roomForTrailing,
  interactive,
  maxWidth,
}: {
  fill: string;
  cornerRadius: number | undefined;
  compact: boolean;
  roomForTrailing: boolean;
  interactive: boolean;
  maxWidth: number | undefined;
}): ModifierConfig[] {
  const capsule = cornerRadius === undefined;
  const sidePad = compact ? 8 : 14;
  return [
    padding({
      leading: sidePad,
      trailing: roomForTrailing && !compact ? 10 : sidePad,
      vertical: compact ? 2 : 8,
    }),
    frame({ minHeight: compact ? undefined : PILL_MIN_HEIGHT, maxWidth }),
    background(fill, capsule ? shapes.capsule() : shapes.roundedRectangle({ cornerRadius })),
    ...(canUseLiquidGlass()
      ? [
          glassEffect({
            glass: { variant: 'regular', interactive },
            ...(capsule
              ? { shape: 'capsule' as const }
              : { shape: 'roundedRectangle' as const, cornerRadius }),
          }),
        ]
      : []),
  ];
}

function pillTextModifiers(
  textStyle: PillTextStyle,
  weight: NonNullable<NativeGlassPillProps['weight']>,
  tintColor: string,
  monospacedDigits: boolean,
  numberOfLines: number,
): ModifierConfig[] {
  return [
    font({ textStyle, weight }),
    foregroundStyle(tintColor),
    ...(monospacedDigits ? [monospacedDigit()] : []),
    // 0 lines: wrap and grow vertically (centered, like a short message).
    ...(numberOfLines > 0
      ? [lineLimit(numberOfLines)]
      : [multilineTextAlignment('center'), fixedSize({ horizontal: false, vertical: true })]),
  ];
}

function pillAccessibilityModifiers(
  hidden: boolean,
  label: string | undefined,
  hint: string | undefined,
): ModifierConfig[] {
  if (hidden) return [accessibilityHidden(true)];
  return [
    ...(label ? [swiftAccessibilityLabel(label)] : []),
    ...(hint ? [swiftAccessibilityHint(hint)] : []),
  ];
}

function PillSymbol({ name, size, color }: { name: AppIconName; size: number; color: ColorValue }) {
  return (
    <SwiftImage
      systemName={resolveAppIconName(name) as SFSymbol}
      size={size}
      color={color}
      modifiers={[accessibilityHidden(true)]}
    />
  );
}

export function NativeGlassPill({
  label,
  tintColor,
  fill,
  leadingIcon,
  leadingIconColor,
  leadingIconSize = APP_ICON_SIZE.xs,
  trailingAction,
  onPress,
  trailingIcon,
  accessibilityLabel,
  accessibilityHint,
  accessibilityHidden: hidden = false,
  textStyle = 'footnote',
  weight = 'semibold',
  monospacedDigits = false,
  numberOfLines = 1,
  cornerRadius,
  size = 'regular',
  colorScheme = 'dark',
  maxWidth,
  style,
}: NativeGlassPillProps) {
  const interactive = Boolean(onPress);
  const hasTrailingButton = Boolean(trailingAction);
  const surface = pillSurfaceModifiers({
    fill,
    cornerRadius,
    compact: size === 'compact',
    roomForTrailing: hasTrailingButton || Boolean(trailingIcon),
    interactive,
    maxWidth,
  });
  const a11y = pillAccessibilityModifiers(hidden, accessibilityLabel, accessibilityHint);
  const text = (
    <SwiftText modifiers={pillTextModifiers(textStyle, weight, tintColor, monospacedDigits, numberOfLines)}>
      {label}
    </SwiftText>
  );
  const leading = leadingIcon ? (
    <PillSymbol name={leadingIcon} size={leadingIconSize} color={leadingIconColor ?? tintColor} />
  ) : null;

  const content = onPress ? (
    <Button onPress={onPress} modifiers={[buttonStyle('plain'), ...a11y]}>
      <HStack spacing={8} alignment="center" modifiers={surface}>
        {leading}
        {text}
        {trailingIcon ? <PillSymbol name={trailingIcon} size={APP_ICON_SIZE.xs} color={tintColor} /> : null}
      </HStack>
    </Button>
  ) : (
    <HStack spacing={hasTrailingButton ? 6 : 8} alignment="center" modifiers={surface}>
      <HStack
        spacing={8}
        alignment="center"
        modifiers={[accessibilityElement('combine'), ...a11y]}>
        {leading}
        {text}
      </HStack>
      {trailingAction ? (
        <Button
          onPress={trailingAction.onPress}
          modifiers={[
            buttonStyle('plain'),
            frame({ width: TRAILING_BUTTON_SIZE, height: TRAILING_BUTTON_SIZE }),
            swiftAccessibilityLabel(trailingAction.accessibilityLabel),
          ]}>
          <SwiftImage
            systemName={resolveAppIconName(trailingAction.icon) as SFSymbol}
            size={APP_ICON_SIZE.xs}
            color={tintColor}
          />
        </Button>
      ) : null}
    </HStack>
  );

  return (
    <Host
      matchContents
      colorScheme={colorScheme}
      ignoreSafeArea="all"
      pointerEvents={interactive || hasTrailingButton ? 'auto' : 'none'}
      style={style}>
      {content}
    </Host>
  );
}
