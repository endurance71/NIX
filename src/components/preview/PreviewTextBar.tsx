import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  MEDIA_TEXT_CAPTION_BAR_COLOR,
  MEDIA_TEXT_CAPTION_BAR_PADDING_H,
  MEDIA_TEXT_CAPTION_BAR_PADDING_V,
  TRANSPARENT_MEDIA_TEXT_BAR_COLOR,
  isDefaultBarColor,
  resolveMediaTextBarColor,
  type MediaTextVariant,
} from '../../types/mediaTextOverlay';

type PreviewTextBarProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  barColor?: string;
  variant?: MediaTextVariant;
  /** Inner horizontal padding the children add themselves (subtracted from the strip's). */
  contentInsetH?: number;
};

function isColorTransparent(color: string): boolean {
  const upper = color.toUpperCase();
  return (
    upper === TRANSPARENT_MEDIA_TEXT_BAR_COLOR ||
    upper === '#00000000' ||
    upper === 'TRANSPARENT'
  );
}

function isDarkTint(color: string): boolean {
  const upper = color.toUpperCase();
  return upper.startsWith('#000000') || upper.startsWith('#1') || upper.startsWith('#2');
}

function colorToGlassRgba(color: string): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('rgba') || trimmed.startsWith('hsla')) return trimmed;
  let hex = trimmed.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((x) => x + x).join('');
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.35)`;
  }
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100;
    const effectiveAlpha = Math.min(a, 0.40);
    return `rgba(${r}, ${g}, ${b}, ${effectiveAlpha})`;
  }
  return color;
}

/**
 * Static translucent caption bar with Apple system material blur. The `bar` variant is the
 * Snapchat strip instead: a flat 60% black fill with square edges, exactly what the bake draws
 * (a blur cannot be baked, so it has none).
 */
export function PreviewTextBar({
  children,
  style,
  barColor = DEFAULT_MEDIA_TEXT_BAR_COLOR,
  variant = 'sticker',
  contentInsetH = 0,
}: PreviewTextBarProps) {
  if (variant === 'bar') {
    return (
      <View
        style={[
          styles.strip,
          { paddingHorizontal: Math.max(0, MEDIA_TEXT_CAPTION_BAR_PADDING_H - contentInsetH) },
          style,
        ]}>
        {children}
      </View>
    );
  }

  const resolvedColor = resolveMediaTextBarColor(barColor);
  const isTransparent = isColorTransparent(resolvedColor);
  const isDefault = isDefaultBarColor(resolvedColor);
  const dark = isDarkTint(resolvedColor);
  const glassTint = colorToGlassRgba(resolvedColor);

  if (isTransparent) {
    return <View style={[styles.transparentBar, style]}>{children}</View>;
  }

  return (
    <BlurView
      intensity={35}
      tint={
        dark
          ? 'systemMaterialDark'
          : isDefault
            ? 'systemUltraThinMaterialLight'
            : 'systemMaterialLight'
      }
      style={[styles.bar, style]}>
      {!isDefault ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: glassTint }]}
        />
      ) : null}
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  strip: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: MEDIA_TEXT_CAPTION_BAR_PADDING_V,
    backgroundColor: MEDIA_TEXT_CAPTION_BAR_COLOR,
  },
  bar: {
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  transparentBar: {
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
});
