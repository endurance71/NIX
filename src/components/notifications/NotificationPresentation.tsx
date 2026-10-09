import { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { NotificationSnapshot } from '../../lib/notificationQueue';
import { notificationLayout } from './notificationLayout';
import { NotificationCardBody } from './NotificationCardBody';
import { NotificationGoo } from './NotificationGoo';
import { buildNotificationGeometry } from './vendor/geometry';
import { useNotificationAnimation } from './useNotificationAnimation';
import { useNotificationGesture } from './useNotificationGesture';
import { CONTENT_MIN_SCALE } from './vendor/timeline';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type Props = { snapshot: NotificationSnapshot; reducedMotion: boolean; screenReader: boolean };

export function NotificationPresentation(props: Props) {
  const { snapshot } = props;
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measured, setMeasured] = useState<{ height: number; width: number; fontScale: number } | null>(null);
  const maxHeight = Math.max(72, height - insets.top - insets.bottom - 40);
  const layout = notificationLayout(width, insets.top, Math.min(maxHeight, measured?.height ?? 72));
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

type MeasuredProps = Props & { layout: ReturnType<typeof notificationLayout>; scrollable: boolean };

function MeasuredNotification({ snapshot, reducedMotion, screenReader, layout, scrollable }: MeasuredProps) {
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const morph = layout.morph && !reducedMotion;
  const [surfaceReady, setSurfaceReady] = useState(false);
  const motion = useNotificationAnimation(snapshot, reducedMotion, morph, screenReader, surfaceReady);
  const { drop, expand, reveal, dragY } = motion;
  const token = useMemo(() => ({ id: snapshot.notification!.id, generation: snapshot.generation }), [snapshot.notification, snapshot.generation]);
  const { gesture, dismiss, press } = useNotificationGesture(token, dragY, !scrollable);
  const background = isDark ? colors.secondarySystemBackground : colors.systemBackground;
  const shadow = isDark ? '#00000066' : '#10131C24';
  const animatedStyle = useAnimatedStyle(() => {
    const geometry = buildNotificationGeometry({ drop: drop.value, expand: expand.value, layout });
    const progress = Math.max(0, Math.min(1, reveal.value));
    const overshoot = Math.max(0, Math.min(0.2, geometry.widthRatio - 1));
    return {
      opacity: progress,
      transform: [
        { translateY: (morph ? geometry.offsetY : reducedMotion ? 0 : (1 - progress) * -12) + dragY.value },
        { scale: morph ? CONTENT_MIN_SCALE + progress * (1 - CONTENT_MIN_SCALE + overshoot) : 1 },
      ],
    };
  });
  const blurProps = useAnimatedProps(() => ({ intensity: reducedMotion ? 0 : (1 - reveal.value) * 24 }));
  const blurStyle = useAnimatedStyle(() => ({ opacity: 1 - reveal.value }));
  const borderStyle = useAnimatedStyle(() => ({
    opacity: morph ? Math.max(0, Math.min(1, (reveal.value - 0.95) / 0.05)) : 1,
  }));
  const notification = snapshot.notification!;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} collapsable={false}
      onLayout={() => setSurfaceReady(true)}>
      {morph ? <NotificationGoo {...motion} layout={layout} color={background} shadow={shadow} /> : null}
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
          {!reducedMotion ? <AnimatedBlurView pointerEvents="none" accessible={false}
            tint={isDark ? 'dark' : 'light'} animatedProps={blurProps}
            style={[StyleSheet.absoluteFill, styles.blur, blurStyle]} /> : null}
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
