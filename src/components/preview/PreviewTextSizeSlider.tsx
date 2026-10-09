import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { selection } from '../../lib/haptics';
import { adjustTextSize } from '../../lib/cameraAccessibility';
import {
  DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE,
  MAX_MEDIA_TEXT_OVERLAY_FONT_SIZE,
  MIN_MEDIA_TEXT_OVERLAY_FONT_SIZE,
} from '../../types/mediaTextOverlay';

export const MIN_MEDIA_TEXT_FONT_SIZE = MIN_MEDIA_TEXT_OVERLAY_FONT_SIZE;
export const MAX_MEDIA_TEXT_FONT_SIZE = MAX_MEDIA_TEXT_OVERLAY_FONT_SIZE;
export const DEFAULT_MEDIA_TEXT_FONT_SIZE = DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE;

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 6;
const CONTROL_RADIUS = 18;

type PreviewTextSizeSliderProps = {
  fontSize: number;
  onChangeFontSize: (fontSize: number) => void;
  accentColor: string;
  capsuleColor: string;
  labelColor: string;
  isDark?: boolean;
};

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

function fractionToFontSize(fraction: number): number {
  'worklet';
  const raw = MIN_MEDIA_TEXT_FONT_SIZE + fraction * (MAX_MEDIA_TEXT_FONT_SIZE - MIN_MEDIA_TEXT_FONT_SIZE);
  return Math.round(raw);
}

function emitHapticTick() {
  selection();
}

function fontSizeToFraction(size: number): number {
  'worklet';
  const clamped = clamp(size, MIN_MEDIA_TEXT_FONT_SIZE, MAX_MEDIA_TEXT_FONT_SIZE);
  return (clamped - MIN_MEDIA_TEXT_FONT_SIZE) / (MAX_MEDIA_TEXT_FONT_SIZE - MIN_MEDIA_TEXT_FONT_SIZE);
}

export function PreviewTextSizeSlider({
  fontSize,
  onChangeFontSize,
  accentColor,
  capsuleColor,
  labelColor,
  isDark = false,
}: PreviewTextSizeSliderProps) {
  const { t } = useTranslation();
  const [trackWidth, setTrackWidth] = useState(0);
  const fraction = useSharedValue(fontSizeToFraction(fontSize));
  const isDragging = useSharedValue(false);
  const trackWidthShared = useSharedValue(0);

  useEffect(() => {
    trackWidthShared.set(trackWidth);
  }, [trackWidth, trackWidthShared]);

  useEffect(() => {
    const nextFraction = fontSizeToFraction(fontSize);
    if (!isDragging.get()) {
      fraction.set(withSpring(nextFraction, { damping: 28, stiffness: 260 }));
    }
  }, [fontSize, fraction, isDragging]);

  const emitFontSizeChange = useCallback((nextFontSize: number) => {
    onChangeFontSize(nextFontSize);
  }, [onChangeFontSize]);

  const updateFromPosition = useCallback((x: number) => {
    'worklet';
    const width = trackWidthShared.get();
    if (width <= 0) return;
    const clampedX = clamp(x, 0, width);
    const nextFraction = clampedX / width;
    fraction.set(nextFraction);
    const newFontSize = fractionToFontSize(nextFraction);
    scheduleOnRN(emitFontSizeChange, newFontSize);
  }, [emitFontSizeChange, fraction, trackWidthShared]);

  const composedGesture = useMemo(() => {
    const panGesture = Gesture.Pan()
      .onBegin((event) => {
        'worklet';
        isDragging.set(true);
        updateFromPosition(event.x);
        scheduleOnRN(emitHapticTick);
      })
      .onUpdate((event) => {
        'worklet';
        updateFromPosition(event.x);
      })
      .onFinalize(() => {
        'worklet';
        isDragging.set(false);
      });

    const tapGesture = Gesture.Tap().onEnd((event) => {
      'worklet';
      updateFromPosition(event.x);
      scheduleOnRN(emitHapticTick);
    });

    return Gesture.Exclusive(panGesture, tapGesture);
  }, [isDragging, updateFromPosition]);

  const thumbAnimatedStyle = useAnimatedStyle(() => {
    const width = trackWidthShared.get();
    const currentX = fraction.get() * width;
    return {
      transform: [
        { translateX: currentX - THUMB_SIZE / 2 },
        { scale: isDragging.get() ? 1.08 : 1 },
      ],
    };
  });

  const fillAnimatedStyle = useAnimatedStyle(() => {
    const width = trackWidthShared.get();
    const currentX = fraction.get() * width;
    return {
      width: Math.max(0, currentX),
    };
  });

  const trackBgColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';

  return (
    <View style={[styles.container, { backgroundColor: capsuleColor }]}>
      <View style={styles.iconWrapLeft} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.glyphSmall, { color: labelColor }]}>A</Text>
      </View>

      <View
        style={styles.sliderContainer}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          if (width > 0 && width !== trackWidth) {
            setTrackWidth(width);
          }
        }}>
        <GestureDetector gesture={composedGesture}>
          <View
            style={styles.touchArea}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t('preview.textSize')}
            accessibilityValue={{
              min: MIN_MEDIA_TEXT_FONT_SIZE, max: MAX_MEDIA_TEXT_FONT_SIZE,
              now: fontSize, text: t('preview.textSizeValue', { size: fontSize }),
            }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName !== 'increment' && nativeEvent.actionName !== 'decrement') return;
              const next = adjustTextSize(fontSize, nativeEvent.actionName,
                MIN_MEDIA_TEXT_FONT_SIZE, MAX_MEDIA_TEXT_FONT_SIZE);
              if (next !== fontSize) { emitFontSizeChange(next); emitHapticTick(); }
            }}>
            <View style={[styles.trackBackground, { backgroundColor: trackBgColor }]}>
              <Animated.View style={[styles.trackFill, { backgroundColor: accentColor }, fillAnimatedStyle]} />
            </View>

            <Animated.View style={[styles.thumb, thumbAnimatedStyle]}>
              <View style={styles.thumbInner} />
            </Animated.View>
          </View>
        </GestureDetector>
      </View>

      <View style={styles.iconWrapRight} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.glyphLarge, { color: labelColor }]}>A</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: CONTROL_RADIUS,
    minHeight: 52,
    paddingHorizontal: 16,
    gap: 12,
  },
  iconWrapLeft: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapRight: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphSmall: {
    fontSize: 14,
    fontWeight: '600',
  },
  glyphLarge: {
    fontSize: 22,
    fontWeight: '700',
  },
  sliderContainer: {
    flex: 1,
    height: 52,
    justifyContent: 'center',
  },
  touchArea: {
    height: 52,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBackground: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
    width: '100%',
  },
  trackFill: {
    height: '100%',
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.22)',
  },
  thumbInner: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
});
