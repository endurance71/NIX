import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  TRANSPARENT_MEDIA_TEXT_BAR_COLOR,
  isDefaultBarColor,
  resolveMediaTextBarColor,
} from '../../types/mediaTextOverlay';

type PreviewTextBarProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  barColor?: string;
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

/** Static translucent caption bar with Apple system material blur. */
export function PreviewTextBar({
  children,
  style,
  barColor = DEFAULT_MEDIA_TEXT_BAR_COLOR,
}: PreviewTextBarProps) {
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
