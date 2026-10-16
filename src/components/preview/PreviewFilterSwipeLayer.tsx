import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { selection } from '../../lib/haptics';
import {
  MEDIA_FILTER_LABEL_KEYS,
  filterStepForSwipe,
  stepMediaFilter,
  type MediaFilterId,
} from '../../lib/mediaFilters';
import { duration, useMotionEnabled } from '../../theme/motion';
import { typography } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';

const LABEL_SLIDE_PX = 28;
const LABEL_HOLD_MS = 900;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

type PreviewFilterSwipeLayerProps = {
  filter: MediaFilterId;
  onChangeFilter: (next: MediaFilterId) => void;
  /** Tap on the media (e.g. next video segment). Also exposed as the VoiceOver activate action. */
  onTap?: () => void;
  tapA11yLabel?: string;
  /** Off while drawing or typing; the layer then lets touches through. */
  enabled: boolean;
  colors: ThemeColors;
};

/**
 * Snapchat-style filter swipe over the media: a horizontal swipe steps to the next/previous
 * filter and the filter name flashes in the middle. VoiceOver gets an adjustable element
 * (swipe up/down) with the filter name as its value; the filter menu in the toolbar is the
 * visible alternative.
 */
export function PreviewFilterSwipeLayer({
  filter,
  onChangeFilter,
  onTap,
  tapA11yLabel,
  enabled,
  colors,
}: PreviewFilterSwipeLayerProps) {
  const { t } = useTranslation();
  const motionEnabled = useMotionEnabled();
  const labelOpacity = useSharedValue(0);
  const labelOffset = useSharedValue(0);
  const isFirstFilterRef = useRef(true);
  const direction = useSharedValue<-1 | 1>(1);

  // Flash the name whenever the filter changes (swipe, menu or VoiceOver), not on mount.
  useEffect(() => {
    if (isFirstFilterRef.current) {
      isFirstFilterRef.current = false;
      return;
    }
    cancelAnimation(labelOpacity);
    cancelAnimation(labelOffset);
    const fadeIn = motionEnabled ? duration.medium : duration.fast;
    labelOpacity.set(
      withSequence(
        withTiming(1, { duration: fadeIn, easing: EASE_OUT }),
        withDelay(LABEL_HOLD_MS, withTiming(0, { duration: duration.slow, easing: EASE_OUT })),
      ),
    );
    if (motionEnabled) {
      labelOffset.set(direction.get() * LABEL_SLIDE_PX);
      labelOffset.set(withTiming(0, { duration: duration.slow, easing: EASE_OUT }));
    } else {
      labelOffset.set(0);
    }
  }, [direction, filter, labelOffset, labelOpacity, motionEnabled]);

  const step = (delta: -1 | 1) => {
    direction.set(delta);
    selection();
    onChangeFilter(stepMediaFilter(filter, delta));
  };

  const handleSwipeEnd = (translationX: number, velocityX: number) => {
    const delta = filterStepForSwipe(translationX, velocityX);
    if (delta !== 0) step(delta);
  };

  const handleTap = () => onTap?.();

  const pan = usePanGesture({
    enabled,
    activeOffsetX: [-16, 16],
    failOffsetY: [-24, 24],
    onDeactivate: (event) => {
      'worklet';
      scheduleOnRN(handleSwipeEnd, event.translationX, event.velocityX);
    },
  });
  const tap = useTapGesture({
    enabled: enabled && Boolean(onTap),
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(handleTap);
    },
  });
  const gesture = useExclusiveGestures(pan, tap);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.get(),
    transform: [{ translateX: labelOffset.get() }],
  }));

  const filterName = t(MEDIA_FILTER_LABEL_KEYS[filter]);
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case 'increment':
        step(1);
        break;
      case 'decrement':
        step(-1);
        break;
      case 'activate':
        onTap?.();
        break;
      default:
        break;
    }
  };

  return (
    <>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.layer}
          pointerEvents={enabled ? 'auto' : 'none'}
          accessible={enabled}
          accessibilityRole="adjustable"
          accessibilityLabel={t('preview.filterA11y')}
          accessibilityValue={{ text: filterName }}
          accessibilityActions={[
            { name: 'increment' },
            { name: 'decrement' },
            ...(onTap ? [{ name: 'activate', label: tapA11yLabel }] : []),
          ]}
          onAccessibilityAction={onAccessibilityAction}
        />
      </GestureDetector>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.labelWrap, labelStyle]}>
        <View style={[styles.labelPill, { backgroundColor: colors.cinemaScrim }]}>
          <Text style={[styles.label, { color: colors.cameraControlTint }]}>
            {filterName}
          </Text>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  // Above the media and its loading state, below the video error overlay (8) and the markup.
  layer: {
    ...StyleSheet.absoluteFill,
    zIndex: 7,
  },
  labelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '38%',
    alignItems: 'center',
    zIndex: 7,
  },
  labelPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  label: {
    ...typography.title2,
  },
});
