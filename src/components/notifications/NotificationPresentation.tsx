import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { NotificationSnapshot } from '../../lib/notificationQueue';
import { notificationLayout } from './notificationLayout';
import { NotificationCardBody } from './NotificationCardBody';
import { buildNotificationGeometry } from './vendor/geometry';
import { useNotificationAnimation } from './useNotificationAnimation';
import { useNotificationGesture } from './useNotificationGesture';
import { CARD_ENTER_OFFSET, CARD_MIN_SCALE, CONTENT_MIN_SCALE } from './vendor/timeline';

// Skia (and its native view registry) is only evaluated the first time a prominent island
// notification is shown, never during app start (PERF-4).
const NotificationGoo = lazy(() => import('./NotificationGoo'));

type Props = { snapshot: NotificationSnapshot; reducedMotion: boolean; screenReader: boolean };

export function NotificationPresentation(props: Props) {
  const { snapshot, reducedMotion } = props;
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measured, setMeasured] = useState<{ height: number; width: number; fontScale: number } | null>(null);
  const maxHeight = Math.max(72, height - insets.top - insets.bottom - 40);
  const allowMorph = Boolean(snapshot.notification?.prominent) && !reducedMotion;
  const layout = notificationLayout(width, insets.top, Math.min(maxHeight, measured?.height ?? 72), allowMorph);
  const onLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setMeasured((current) => current?.height === nextHeight && current.width === width && current.fontScale === fontScale
      ? current : { height: nextHeight, width, fontScale });
  };
  if (!snapshot.notification) return null;
  return (
    <>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.measure, { width: layout.cardWidth }]} onLayout={onLayout}>
        <NotificationCardBody notification={snapshot.notification} />
      </View>
      {measured ? (
        <MeasuredNotification {...props} layout={layout} scrollable={(measured?.height ?? 0) > maxHeight} />
      ) : null}
    </>
  );
}

/** Mounted only once the lazy Skia chunk resolved, so the morph never starts with an empty canvas. */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

type MeasuredProps = Props & { layout: ReturnType<typeof notificationLayout>; scrollable: boolean };

function MeasuredNotification({ snapshot, reducedMotion, screenReader, layout, scrollable }: MeasuredProps) {
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const morph = layout.morph;
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [gooReady, setGooReady] = useState(false);
  const motion = useNotificationAnimation(snapshot, reducedMotion, morph, screenReader, surfaceReady && (!morph || gooReady));
  const { drop, expand, reveal, dragY } = motion;
  const token = useMemo(() => ({ id: snapshot.notification!.id, generation: snapshot.generation }), [snapshot.notification, snapshot.generation]);
  const { gesture, dismiss, press } = useNotificationGesture(token, dragY, !scrollable);
  const markGooReady = useCallback(() => setGooReady(true), []);
  const background = isDark ? colors.secondarySystemBackground : colors.systemBackground;
  const shadow = colors.notificationShadow;
  const animatedStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1, reveal.value));
    if (!morph) {
      // Fast card: slide + scale + fade on the UI thread; Reduce Motion keeps only the fade.
      return {
        opacity: progress,
        transform: [
          { translateY: (reducedMotion ? 0 : (1 - progress) * CARD_ENTER_OFFSET) + dragY.value },
          { scale: reducedMotion ? 1 : CARD_MIN_SCALE + (1 - CARD_MIN_SCALE) * progress },
        ],
      };
    }
    const geometry = buildNotificationGeometry({ drop: drop.value, expand: expand.value, layout });
    const overshoot = Math.max(0, Math.min(0.2, geometry.widthRatio - 1));
    return {
      opacity: progress,
      transform: [
        { translateY: geometry.offsetY + dragY.value },
        { scale: CONTENT_MIN_SCALE + progress * (1 - CONTENT_MIN_SCALE + overshoot) },
      ],
    };
  });
  // Static blur crossfaded by opacity: animating BlurView intensity re-renders the blur every frame.
  const blurStyle = useAnimatedStyle(() => ({ opacity: 1 - reveal.value }));
  const borderStyle = useAnimatedStyle(() => ({
    opacity: morph ? Math.max(0, Math.min(1, (reveal.value - 0.95) / 0.05)) : 1,
  }));
  const notification = snapshot.notification!;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} collapsable={false}
      onLayout={() => setSurfaceReady(true)}>
      {morph ? (
        <Suspense fallback={null}>
          <NotificationGoo {...motion} layout={layout} color={background} shadow={shadow} island={colors.notificationIsland} />
          <Ready onReady={markGooReady} />
        </Suspense>
      ) : null}
      <GestureDetector gesture={gesture}>
        <Animated.View accessible accessibilityRole="button"
          accessibilityLabel={[notification.title, notification.message].filter(Boolean).join('. ')}
          accessibilityHint={t('notify.dismissHint')}
          accessibilityActions={[{ name: 'dismiss', label: t('notify.dismiss') }, { name: 'activate' }]}
          onAccessibilityAction={({ nativeEvent }) => nativeEvent.actionName === 'activate' ? press() : dismiss()}
          onAccessibilityTap={press} onAccessibilityEscape={dismiss}
          pointerEvents={snapshot.phase === 'exiting' ? 'none' : 'auto'}
          style={[styles.card, {
            top: layout.cardTop, left: layout.cardLeft, width: layout.cardWidth, height: layout.cardHeight,
            backgroundColor: morph ? 'transparent' : background,
            boxShadow: morph ? [] : [{ offsetX: 0, offsetY: 5, blurRadius: 9, color: shadow }],
          }, animatedStyle]}>
          {scrollable ? (
            <ScrollView showsVerticalScrollIndicator bounces={false}>
              <NotificationCardBody notification={notification} />
            </ScrollView>
          ) : <NotificationCardBody notification={notification} />}
          {morph ? <Animated.View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, blurStyle]}>
            <BlurView tint={isDark ? 'dark' : 'light'} intensity={24} style={[StyleSheet.absoluteFill, styles.blur]} />
          </Animated.View> : null}
          <Animated.View pointerEvents="none" accessible={false}
            style={[StyleSheet.absoluteFill, styles.border, { borderColor: colors.border }, borderStyle]} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  measure: { position: 'absolute', opacity: 0, top: 0, left: 0 },
  card: {
    position: 'absolute', borderRadius: 28, borderCurve: 'continuous',
    overflow: 'hidden',
  },
  blur: { borderRadius: 28 },
  border: { borderRadius: 28, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth },
});
