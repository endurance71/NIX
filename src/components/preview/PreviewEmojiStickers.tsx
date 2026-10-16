import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useRotationGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { tap } from '../../lib/haptics';
import {
  applyStickerGesture,
  clampLiveStickerScale,
  isFingerOverTrash,
  stickerTrashCenter,
} from '../../lib/previewStickers';
import {
  MAX_EMOJI_STICKER_FONT_SIZE,
  MIN_EMOJI_STICKER_FONT_SIZE,
  type MediaEmojiSticker,
} from '../../types/mediaStickerOverlay';
import type { ThemeColors } from '../../theme/colors';
import { duration, useMotionEnabled } from '../../theme/motion';
import { PreviewTrashTarget } from './PreviewTrashTarget';
import { TRASH_ZONE_SIZE } from './usePreviewTextStickerController';

/**
 * Glyphs render at this size and are scaled with a transform, so pinching never re-lays out
 * text mid-gesture. Large enough to stay sharp at typical sizes (≤ ~160 pt).
 */
const RENDER_FONT_SIZE = 160;
const GESTURE_HIT_SLOP = 24;
/** Sticker shrinking into the trash after a drop. */
const STICKER_REMOVE_MS = 220;
/** A picked sticker pops onto the media: it lands with a little bounce, like a real sticker. */
const STICKER_APPEAR_SPRING = { duration: 420, dampingRatio: 0.62 };
const STICKER_APPEAR_FROM_SCALE = 0.5;
const A11Y_MOVE_STEP = 0.05;
const A11Y_SCALE_STEP = 1.2;
const A11Y_ROTATE_STEP = Math.PI / 12;

function stickerTrashTick() {
  tap('light');
}

type StickerProps = {
  sticker: MediaEmojiSticker;
  stage: { width: number; height: number };
  trash: { x: number; y: number };
  trashVisible: SharedValue<number>;
  trashActive: SharedValue<boolean>;
  enabled: boolean;
  onChange: (next: MediaEmojiSticker) => void;
  onDelete: (id: string) => void;
};

function PreviewEmojiSticker({
  sticker,
  stage,
  trash,
  trashVisible,
  trashActive,
  enabled,
  onChange,
  onDelete,
}: StickerProps) {
  const { t } = useTranslation();
  const motionEnabled = useMotionEnabled();
  // Live state on the UI thread; the committed sticker (props) is written back on gesture end.
  const centerX = useSharedValue(sticker.x * stage.width);
  const centerY = useSharedValue(sticker.y * stage.height);
  const fontSize = useSharedValue(sticker.fontSize);
  const rotation = useSharedValue(sticker.rotation);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startFont = useSharedValue(sticker.fontSize);
  const startRotation = useSharedValue(0);
  const overTrash = useSharedValue(false);
  /** 0 → 1 while the sticker is swallowed by the trash after being dropped on it. */
  const removal = useSharedValue(0);
  /** 0 → 1 as a freshly picked sticker pops in (stays 1 with reduced motion). */
  const appear = useSharedValue(motionEnabled ? 0 : 1);

  useEffect(() => {
    if (!motionEnabled) {
      appear.set(1);
      return;
    }
    appear.set(withSpring(1, STICKER_APPEAR_SPRING));
    // Mount only: a sticker pops in once, when it is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outside changes (VoiceOver actions, stage resize) move the sticker; after a gesture the
  // props equal the live values, so this is a no-op and nothing jumps.
  useEffect(() => {
    centerX.set(sticker.x * stage.width);
    centerY.set(sticker.y * stage.height);
    fontSize.set(sticker.fontSize);
    rotation.set(sticker.rotation);
  }, [
    centerX,
    centerY,
    fontSize,
    rotation,
    sticker.x,
    sticker.y,
    sticker.fontSize,
    sticker.rotation,
    stage.height,
    stage.width,
  ]);

  const commit = (x: number, y: number, size: number, angle: number) => {
    onChange(
      applyStickerGesture(
        { ...sticker, x: 0, y: 0, fontSize: size, rotation: angle },
        { translationX: x, translationY: y, scale: 1, rotation: 0 },
        stage,
      ),
    );
  };
  const remove = () => onDelete(sticker.id);

  const pan = usePanGesture({
    enabled,
    averageTouches: true,
    onActivate: () => {
      'worklet';
      startX.set(centerX.get());
      startY.set(centerY.get());
      trashVisible.set(motionEnabled ? withTiming(1, { duration: duration.fast }) : 1);
    },
    onUpdate: (event) => {
      'worklet';
      centerX.set(startX.get() + event.translationX);
      centerY.set(startY.get() + event.translationY);
      const over = isFingerOverTrash(event.absoluteX, event.absoluteY, trash.x, trash.y);
      overTrash.set(over);
      trashActive.set(over);
    },
    onDeactivate: () => {
      'worklet';
      if (overTrash.get()) {
        // Shrink into the trash, then delete; the trash stays red until the sticker is gone.
        removal.set(
          withTiming(
            1,
            { duration: motionEnabled ? STICKER_REMOVE_MS : duration.fast, easing: Easing.in(Easing.cubic) },
            (finished) => {
              trashActive.set(false);
              if (finished) scheduleOnRN(remove);
            },
          ),
        );
        return;
      }
      scheduleOnRN(commit, centerX.get(), centerY.get(), fontSize.get(), rotation.get());
    },
    onFinalize: () => {
      'worklet';
      // While the sticker is being swallowed, the red trash stays up until it is gone.
      const removing = overTrash.get();
      if (!removing) trashActive.set(false);
      const hide = withTiming(0, { duration: motionEnabled ? duration.fast : 0 });
      trashVisible.set(removing ? withDelay(STICKER_REMOVE_MS, hide) : hide);
    },
  });

  const pinch = usePinchGesture({
    enabled,
    onActivate: () => {
      'worklet';
      startFont.set(fontSize.get());
    },
    onUpdate: (event) => {
      'worklet';
      const base = startFont.get();
      fontSize.set(base * clampLiveStickerScale(base, event.scale));
    },
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(commit, centerX.get(), centerY.get(), fontSize.get(), rotation.get());
    },
  });

  const rotate = useRotationGesture({
    enabled,
    onActivate: () => {
      'worklet';
      startRotation.set(rotation.get());
    },
    onUpdate: (event) => {
      'worklet';
      rotation.set(startRotation.get() + event.rotation);
    },
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(commit, centerX.get(), centerY.get(), fontSize.get(), rotation.get());
    },
  });

  const gesture = useSimultaneousGestures(pan, pinch, rotate);

  useAnimatedReaction(
    () => overTrash.get(),
    (current, previous) => {
      if (current && previous === false) scheduleOnRN(stickerTrashTick);
    },
  );

  const animatedStyle = useAnimatedStyle(() => {
    const gone = removal.get();
    const popped = appear.get();
    const trashScale = (overTrash.get() ? 0.6 : 1) * (motionEnabled ? 1 - gone : 1);
    const popScale = STICKER_APPEAR_FROM_SCALE + (1 - STICKER_APPEAR_FROM_SCALE) * popped;
    return {
      opacity: (overTrash.get() ? 0.6 : 1) * (1 - gone) * Math.min(1, popped * 3),
      transform: [
        { translateX: centerX.get() },
        { translateY: centerY.get() },
        { rotate: `${rotation.get()}rad` },
        { scale: (fontSize.get() / RENDER_FONT_SIZE) * trashScale * popScale },
      ],
    };
  });

  const update = (patch: Partial<MediaEmojiSticker>) =>
    onChange(
      applyStickerGesture(
        { ...sticker, ...patch },
        { translationX: 0, translationY: 0, scale: 1, rotation: 0 },
        stage,
      ),
    );
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case 'enlarge':
        update({ fontSize: Math.min(MAX_EMOJI_STICKER_FONT_SIZE, sticker.fontSize * A11Y_SCALE_STEP) });
        break;
      case 'shrink':
        update({ fontSize: Math.max(MIN_EMOJI_STICKER_FONT_SIZE, sticker.fontSize / A11Y_SCALE_STEP) });
        break;
      case 'rotate':
        update({ rotation: sticker.rotation + A11Y_ROTATE_STEP });
        break;
      case 'moveUp':
        update({ y: sticker.y - A11Y_MOVE_STEP });
        break;
      case 'moveDown':
        update({ y: sticker.y + A11Y_MOVE_STEP });
        break;
      case 'moveLeft':
        update({ x: sticker.x - A11Y_MOVE_STEP });
        break;
      case 'moveRight':
        update({ x: sticker.x + A11Y_MOVE_STEP });
        break;
      case 'delete':
        remove();
        break;
      default:
        break;
    }
  };

  return (
    <Animated.View style={[styles.anchor, animatedStyle]} pointerEvents="box-none">
      <GestureDetector gesture={gesture}>
        {/* The grab margin lives on the view: Gesture Handler 3 measures a gesture's hitSlop
            against its detector (display: contents, no real bounds) and drops the second
            finger of a pinch. */}
        <View
          style={styles.glyphBox}
          hitSlop={GESTURE_HIT_SLOP}
          accessible
          accessibilityLabel={t('preview.stickerA11y', { emoji: sticker.emoji })}
          accessibilityActions={[
            { name: 'enlarge', label: t('preview.stickerEnlarge') },
            { name: 'shrink', label: t('preview.stickerShrink') },
            { name: 'rotate', label: t('preview.stickerRotate') },
            { name: 'moveUp', label: t('preview.stickerMoveUp') },
            { name: 'moveDown', label: t('preview.stickerMoveDown') },
            { name: 'moveLeft', label: t('preview.stickerMoveLeft') },
            { name: 'moveRight', label: t('preview.stickerMoveRight') },
            { name: 'delete', label: t('preview.stickerDelete') },
          ]}
          onAccessibilityAction={onAccessibilityAction}>
          <Text style={styles.glyph} allowFontScaling={false}>
            {sticker.emoji}
          </Text>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

type PreviewEmojiStickersProps = {
  stickers: readonly MediaEmojiSticker[];
  onChangeStickers: (next: MediaEmojiSticker[]) => void;
  /** Media stage (visible cover frame); stickers are positioned in its coordinates. */
  stageStyle?: StyleProp<ViewStyle>;
  /** Safe-area bottom inset; the trash sits in the bottom controls band. */
  bottomInset: number;
  enabled: boolean;
  colors: ThemeColors;
};

/** Emoji stickers layer (drag, pinch, rotate; drop on the trash to delete). */
export function PreviewEmojiStickers({
  stickers,
  onChangeStickers,
  stageStyle,
  bottomInset,
  enabled,
  colors,
}: PreviewEmojiStickersProps) {
  const windowSize = useWindowDimensions();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const trashVisible = useSharedValue(0);
  const trashActive = useSharedValue(false);
  const trash = stickerTrashCenter(windowSize, bottomInset);


  const updateSticker = (next: MediaEmojiSticker) =>
    onChangeStickers(stickers.map((item) => (item.id === next.id ? next : item)));
  const deleteSticker = (id: string) => onChangeStickers(stickers.filter((item) => item.id !== id));

  return (
    <>
      {/* The trash stays mounted (invisible at rest): dropping the last sticker lets it fade out
          instead of unmounting with the sticker. */}
      {stickers.length > 0 ? (
        <View
          style={[StyleSheet.absoluteFill, styles.stage, stageStyle]}
          pointerEvents={enabled ? 'box-none' : 'none'}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            if (width !== stage.width || height !== stage.height) setStage({ width, height });
          }}>
          {stage.width > 0
            ? stickers.map((sticker) => (
                <PreviewEmojiSticker
                  key={sticker.id}
                  sticker={sticker}
                  stage={stage}
                  trash={trash}
                  trashVisible={trashVisible}
                  trashActive={trashActive}
                  enabled={enabled}
                  onChange={updateSticker}
                  onDelete={deleteSticker}
                />
              ))
            : null}
        </View>
      ) : null}
      {/* Drag target; VoiceOver users delete with the sticker's "Delete" action. */}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.trash,
          { left: trash.x - TRASH_ZONE_SIZE / 2, top: trash.y - TRASH_ZONE_SIZE / 2 },
        ]}>
        <PreviewTrashTarget visible={trashVisible} active={trashActive} colors={colors} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  stage: {
    zIndex: 9,
  },
  anchor: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    overflow: 'visible',
  },
  glyphBox: {
    position: 'absolute',
    // Extra grab area (in render-size points, scaled down with the glyph).
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
  },
  glyph: {
    fontSize: RENDER_FONT_SIZE,
    // No custom line height: the bake measures the emoji with the system font's own metrics.
  },
  trash: {
    position: 'absolute',
    width: TRASH_ZONE_SIZE,
    height: TRASH_ZONE_SIZE,
    zIndex: 22,
  },
});
