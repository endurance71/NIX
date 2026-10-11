import { useState } from 'react';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Host, Image as SwiftImage } from '@expo/ui/swift-ui';
import {
  animation,
  Animation,
  frame,
  glassEffect,
  opacity,
  scaleEffect,
} from '@expo/ui/swift-ui/modifiers';
import type { ThemeColors } from '../../theme/colors';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { useMotionEnabled } from '../../theme/motion';
import { TRASH_ZONE_SIZE } from './usePreviewTextStickerController';

type PreviewTrashTargetProps = {
  /** Driven 0 → 1 while a sticker is dragged; only its direction matters here (UI thread). */
  visible: SharedValue<number>;
  /** True while the dragged sticker is over the target (UI thread). */
  active: SharedValue<boolean>;
  colors: ThemeColors;
};

/**
 * Liquid Glass drop target for deleting a dragged sticker, like the editor's other glass
 * controls. It appears, grows and turns red with SwiftUI animations: animating a glass view's
 * parent opacity / scale from Reanimated re-renders the glass offscreen every frame and stutters.
 * Decorative: VoiceOver users delete through each sticker's own action.
 */
export function PreviewTrashTarget({ visible, active, colors }: PreviewTrashTargetProps) {
  const motionEnabled = useMotionEnabled();
  const [shown, setShown] = useState(false);
  const [isActive, setIsActive] = useState(false);
  // The first frame of a fade decides: rising → show, falling → hide (no per-frame updates).
  useAnimatedReaction(
    () => visible.get(),
    (current, previous) => {
      if (previous === null || current === previous) return;
      const next = current > previous;
      scheduleOnRN(setShown, next);
    },
  );
  useAnimatedReaction(
    () => active.get(),
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setIsActive, current);
    },
  );
  const scale = !shown ? 0.85 : isActive && motionEnabled ? 1.15 : 1;
  return (
    <Host matchContents style={{ width: TRASH_ZONE_SIZE, height: TRASH_ZONE_SIZE }}>
      <SwiftImage
        systemName={resolveAppIconName('trash') as SFSymbol}
        size={APP_ICON_SIZE.xl}
        color={colors.cameraControlTint}
        modifiers={[
          frame({ width: TRASH_ZONE_SIZE, height: TRASH_ZONE_SIZE }),
          glassEffect({
            glass: { variant: 'regular', ...(isActive ? { tint: colors.destructive } : {}) },
            shape: 'circle',
          }),
          scaleEffect(motionEnabled ? scale : 1),
          opacity(shown ? 1 : 0),
          animation(
            motionEnabled ? Animation.spring({ duration: 0.28, bounce: 0.2 }) : Animation.easeInOut({ duration: 0.15 }),
            (shown ? 2 : 0) + (isActive ? 1 : 0),
          ),
        ]}
      />
    </Host>
  );
}
