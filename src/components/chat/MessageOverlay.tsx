import { useEffect, useRef, type ReactElement } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import { layoutMessageMenu } from '../../lib/chatMessageMenuLayout';
import { MESSAGE_REACTION_EMOJIS, MESSAGE_REACTION_GLYPHS } from '../../services/messageReactionService';
import { appleUiSpring, duration, useMotionEnabled } from '../../theme/motion';
import type { MessageReactionEmoji } from '../../types/database.types';
import {
  MESSAGE_ACTION_MENU_WIDTH,
  MessageActionMenu,
  messageActionMenuHeight,
  type MessageActionMenuItem,
} from './MessageActionMenu';

const SLOT = 50;
const BAR_PADDING = 8;
const BAR_HEIGHT = SLOT + BAR_PADDING * 2;
const GAP = 8;
const SIDE_INSET = 12;
/** The held bubble lifts a little above the blur, like a context-menu preview. */
const LIFT_SCALE = 1.03;

/** The bubble the overlay opens on, in the chat root's coordinates. */
export type MessageOverlayTarget = {
  messageId: string;
  isOwn: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rootWidth: number;
  rootHeight: number;
};

/**
 * `tapback`: double tap — only the large emoji bar (iMessage).
 * `menu`: long press — the chat blurs, a clear copy of the bubble lifts, the emoji bar sits above
 * it and the action menu below (or both above near the composer).
 */
export type MessageOverlayRequest = {
  mode: 'tapback' | 'menu';
  target: MessageOverlayTarget;
  canReact: boolean;
  /** The bubble drawn above the blur (menu mode). */
  preview: ReactElement | null;
  actions: readonly MessageActionMenuItem[];
};

function barWidth(rootWidth: number) {
  return Math.min(MESSAGE_REACTION_EMOJIS.length * SLOT + BAR_PADDING * 2, rootWidth - SIDE_INSET * 2);
}

function barLeft(target: MessageOverlayTarget, width: number) {
  const preferred = target.isOwn ? target.x + target.width - width : target.x;
  return Math.min(Math.max(SIDE_INSET, preferred), target.rootWidth - SIDE_INSET - width);
}

export function MessageOverlay({
  request,
  minTop,
  bottomLimit,
  selectedEmoji,
  onSelect,
  onDismiss,
}: {
  request: MessageOverlayRequest;
  /** Below the transparent navigation bar. */
  minTop: number;
  /** Above the home indicator. */
  bottomLimit: number;
  selectedEmoji: MessageReactionEmoji | null;
  onSelect: (emoji: MessageReactionEmoji) => void;
  onDismiss: () => void;
}) {
  const { colors, colorScheme } = useAppTheme();
  const { t } = useTranslation();
  const motionEnabled = useMotionEnabled();
  const useGlass = canUseLiquidGlass();
  const { target, mode, canReact } = request;
  const isMenu = mode === 'menu';
  const actions = isMenu ? request.actions : [];
  const width = barWidth(target.rootWidth);
  const left = barLeft(target, width);
  const menuLayout = layoutMessageMenu({
    bubble: { x: target.x, y: target.y, width: target.width, height: target.height },
    rootWidth: target.rootWidth,
    rootHeight: target.rootHeight,
    minTop,
    bottomLimit,
    barHeight: BAR_HEIGHT,
    showBar: canReact,
    menuWidth: MESSAGE_ACTION_MENU_WIDTH,
    menuHeight: messageActionMenuHeight(actions),
    isOwn: target.isOwn,
    gap: GAP,
    sideInset: SIDE_INSET,
  });
  const tapbackAbove = target.y - GAP - BAR_HEIGHT;
  const barTop = isMenu
    ? menuLayout.barTop
    : tapbackAbove >= minTop
      ? tapbackAbove
      : target.y + target.height + GAP;

  const progress = useSharedValue(motionEnabled ? 0 : 1);
  const firstRef = useRef<ViewInstance>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    if (motionEnabled) progress.set(withSpring(1, appleUiSpring));
    const frame = requestAnimationFrame(() => {
      if (firstRef.current) AccessibilityInfo.sendAccessibilityEvent(firstRef.current, 'focus');
    });
    return () => cancelAnimationFrame(frame);
  }, [motionEnabled, progress]);

  /** Folds everything back into the bubble, then removes the overlay and runs `after`. */
  const close = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    const finish = () => {
      onDismiss();
      after?.();
    };
    if (!motionEnabled) {
      finish();
      return;
    }
    progress.set(
      withTiming(0, { duration: duration.fast, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(finish);
      }),
    );
  };

  const select = (value: MessageReactionEmoji) => {
    // The reaction lands at once (badge on the bubble); the overlay then folds away.
    onSelect(value);
    close();
  };

  // Scale only on glass (never opacity on a GlassView ancestor, expo-glass-effect).
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: Math.max(0.001, progress.get()) }],
  }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, progress.get())) }));
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (LIFT_SCALE - 1) * Math.min(1, Math.max(0, progress.get())) }],
  }));

  const emoji = (
    <View style={styles.row}>
      {MESSAGE_REACTION_EMOJIS.map((value, index) => {
        const selected = selectedEmoji === value;
        const glyph = MESSAGE_REACTION_GLYPHS[value];
        return (
          <Pressable
            key={value}
            ref={index === 0 ? firstRef : undefined}
            onPress={() => select(value)}
            accessibilityRole="button"
            accessibilityLabel={
              selected ? t('chat.removeReactionWith', { emoji: glyph }) : t('chat.reactWith', { emoji: glyph })
            }
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.slot,
              selected ? { backgroundColor: colors.systemFill } : null,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={styles.glyph}>{glyph}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const horizontalOrigin = target.isOwn ? 'right' : 'left';

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={() => close()}>
      {isMenu ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fadeStyle]}>
          <BlurView
            intensity={40}
            tint={colorScheme === 'dark' ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => close()}
        accessibilityRole="button"
        accessibilityLabel={t('chat.closeReactions')}
      />
      {isMenu && request.preview ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.preview,
            {
              left: target.x,
              top: target.y,
              width: target.width,
              alignItems: target.isOwn ? 'flex-end' : 'flex-start',
              transformOrigin: `${horizontalOrigin} center`,
            },
            liftStyle,
          ]}>
          {request.preview}
        </Animated.View>
      ) : null}
      {canReact ? (
        <Animated.View
          style={[
            styles.bar,
            { left, top: barTop, width, transformOrigin: `${horizontalOrigin} bottom` },
            popStyle,
          ]}>
          {useGlass ? (
            <GlassView style={styles.glass} glassEffectStyle="regular" isInteractive>
              {emoji}
            </GlassView>
          ) : (
            <View style={[styles.glass, { backgroundColor: colors.secondarySystemBackground }]}>{emoji}</View>
          )}
        </Animated.View>
      ) : null}
      {actions.length > 0 ? (
        <Animated.View
          style={[
            styles.menu,
            {
              left: menuLayout.menuLeft,
              top: menuLayout.menuTop,
              transformOrigin: `${horizontalOrigin} ${menuLayout.menuBelowBubble ? 'top' : 'bottom'}`,
            },
            popStyle,
          ]}>
          <MessageActionMenu
            items={actions.map((item) => ({ ...item, onPress: () => close(item.onPress) }))}
            focusRef={canReact ? undefined : firstRef}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    position: 'absolute',
  },
  bar: {
    position: 'absolute',
    height: BAR_HEIGHT,
  },
  menu: {
    position: 'absolute',
  },
  glass: {
    flex: 1,
    borderRadius: BAR_HEIGHT / 2,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: BAR_PADDING,
  },
  slot: {
    width: SLOT - 4,
    height: SLOT - 4,
    borderRadius: (SLOT - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 1.18 }],
  },
  glyph: {
    fontSize: 32,
    lineHeight: 40,
  },
});
