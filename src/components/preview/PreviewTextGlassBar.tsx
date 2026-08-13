import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { DEFAULT_MEDIA_TEXT_BAR_COLOR, isDefaultBarColor } from '../../types/mediaTextOverlay';

function canUseLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

type PreviewTextGlassBarProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Interactive glass (edit bar / tappable sticker). */
  isInteractive?: boolean;
  /**
   * Caption bar fill. Default translucent dark keeps Liquid Glass;
   * any other color uses solid fill (WYSIWYG with bake).
   */
  barColor?: string;
  /** Keeps the native glass transition synchronized with sticker content. */
  visible?: boolean;
  animateEnter?: boolean;
  transitionDurationMs?: number;
};

/**
 * Liquid Glass caption bar for preview text stickers.
 * Falls back to a dark translucent pill when Liquid Glass API is unavailable.
 * Custom bar colors render as solid fills (glass cannot be baked into media).
 */
export function PreviewTextGlassBar({
  children,
  style,
  isInteractive = true,
  barColor = DEFAULT_MEDIA_TEXT_BAR_COLOR,
  visible = true,
  animateEnter = false,
  transitionDurationMs = 180,
}: PreviewTextGlassBarProps) {
  const useDefaultGlass = isDefaultBarColor(barColor);
  const useGlass = useDefaultGlass && canUseLiquidGlass();
  const [entryReady, setEntryReady] = useState(!animateEnter);

  useEffect(() => {
    if (!animateEnter) return;

    const enterFrame = requestAnimationFrame(() => setEntryReady(true));
    return () => cancelAnimationFrame(enterFrame);
  }, [animateEnter]);

  const glassVisible = visible && (!animateEnter || entryReady);

  if (useGlass) {
    return (
      <View style={[styles.bar, style]}>
        <GlassView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          glassEffectStyle={{
            style: glassVisible ? 'regular' : 'none',
            animate: true,
            animationDuration: transitionDurationMs / 1000,
          }}
          isInteractive={isInteractive}
        />
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.bar, { backgroundColor: barColor }, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
