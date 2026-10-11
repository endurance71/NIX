import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import { MESSAGE_REACTION_EMOJIS, MESSAGE_REACTION_GLYPHS } from '../../services/messageReactionService';
import { appleUiSpring, useMotionEnabled } from '../../theme/motion';
import type { MessageReactionEmoji } from '../../types/database.types';

const SLOT = 50;
const BAR_PADDING = 8;
const BAR_HEIGHT = SLOT + BAR_PADDING * 2;
const GAP = 8;
const SIDE_INSET = 12;

/** The double-tapped bubble, in the chat root's coordinates. */
export type TapbackTarget = {
  messageId: string;
  isOwn: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rootWidth: number;
};

/** Above the bubble, or below it when the header leaves no room; clamped to the screen sides. */
export function layoutTapbackBar(target: TapbackTarget, minTop: number) {
  const width = Math.min(
    MESSAGE_REACTION_EMOJIS.length * SLOT + BAR_PADDING * 2,
    target.rootWidth - SIDE_INSET * 2,
  );
  const preferredLeft = target.isOwn ? target.x + target.width - width : target.x;
  const left = Math.min(Math.max(SIDE_INSET, preferredLeft), target.rootWidth - SIDE_INSET - width);
  const above = target.y - GAP - BAR_HEIGHT;
  const top = above >= minTop ? above : target.y + target.height + GAP;
  return { left, top, width };
}

/**
 * iMessage double tap: only the Tapback bar, large emoji on glass, over the bubble. Tapping my
 * current reaction takes it back. The long-press system menu keeps every other action.
 */
export function TapbackOverlay({
  target,
  minTop,
  selectedEmoji,
  onSelect,
  onDismiss,
}: {
  target: TapbackTarget;
  minTop: number;
  selectedEmoji: MessageReactionEmoji | null;
  onSelect: (emoji: MessageReactionEmoji) => void;
  onDismiss: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const motionEnabled = useMotionEnabled();
  const useGlass = canUseLiquidGlass();
  const { left, top, width } = layoutTapbackBar(target, minTop);
  const progress = useSharedValue(motionEnabled ? 0 : 1);
  const firstRef = useRef<View>(null);

  useEffect(() => {
    if (motionEnabled) progress.set(withSpring(1, appleUiSpring));
    const frame = requestAnimationFrame(() => {
      if (firstRef.current) AccessibilityInfo.sendAccessibilityEvent(firstRef.current, 'focus');
    });
    return () => cancelAnimationFrame(frame);
  }, [motionEnabled, progress]);

  // Scale only: never opacity on a GlassView ancestor (expo-glass-effect).
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + progress.get() * 0.4 }],
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
            onPress={() => onSelect(value)}
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

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={onDismiss}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('chat.closeReactions')}
      />
      <Animated.View
        style={[
          styles.bar,
          { left, top, width, transformOrigin: `${target.isOwn ? 'right' : 'left'} bottom` },
          barStyle,
        ]}>
        {useGlass ? (
          <GlassView style={styles.glass} glassEffectStyle="regular" isInteractive>
            {emoji}
          </GlassView>
        ) : (
          <View style={[styles.glass, { backgroundColor: colors.secondarySystemBackground }]}>{emoji}</View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    height: BAR_HEIGHT,
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
