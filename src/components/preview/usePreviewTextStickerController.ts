import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Keyboard, TextInput, useWindowDimensions, type KeyboardEvent, type TextStyle } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { appleUiSpring, duration, useMotionEnabled } from '../../theme/motion';
import type { MediaTextOverlayStyle } from '../../types/mediaTextOverlay';
import { resolveMediaTextFontFamily } from '../../theme/mediaTextOverlayFonts';
import {
  captionMinimumBarHeight,
  clampPreviewTextTopPx,
  previewTextTopAboveObstacle,
} from '../../lib/mediaTextOverlayGeometry';
import type { PreviewTextStickerProps } from './PreviewTextSticker.types';
import { tap } from '../../lib/haptics';

/** How far past its lowest resting spot the sticker can be dragged toward the trash zone. */
const TRASH_OVERDRAG_PX = 72;
/** Past this much overdrag the sticker is over the trash zone; releasing deletes it. */
const TRASH_ACTIVATE_PX = 28;
export const TRASH_ZONE_SIZE = 56;
const DROP_SPRING = { duration: 400, dampingRatio: 0.8 } as const;

function trashTick() {
  tap('light');
}

const FORMAT_SHEET_FALLBACK_HEIGHT = 380;
const FORMAT_PARK_REFINE_EPSILON = 10;
const LIFT_STICKER_RESERVE = 118;
const LIFT_GAP = 32;
export const BAR_TEXT_HORIZONTAL_PADDING = 4;

const STICKER_PRESENCE_TIMING = {
  duration: duration.medium,
  easing: Easing.out(Easing.cubic),
} as const;

const formatLiftSpring = {
  damping: 32,
  stiffness: 320,
  mass: 1,
  overshootClamping: true,
} as const;

function animateFormatLift(shared: SharedValue<number>, toValue: number, motionEnabled: boolean) {
  cancelAnimation(shared);
  if (!motionEnabled) {
    shared.set(toValue);
    return;
  }
  shared.set(withSpring(toValue, formatLiftSpring));
}

function keyboardHeightFromEvent(event: KeyboardEvent, windowHeight: number) {
  const { height, screenY } = event.endCoordinates;
  if (height > 0) return height;
  return Math.max(0, windowHeight - screenY);
}

function sheetParkTop({
  sheetHeight,
  windowHeight,
  minTopPx,
  maxTopPx,
}: {
  sheetHeight: number;
  windowHeight: number;
  minTopPx: number;
  maxTopPx: number;
}) {
  return previewTextTopAboveObstacle({
    windowHeight,
    obstacleHeight:
      sheetHeight > 0 ? sheetHeight : FORMAT_SHEET_FALLBACK_HEIGHT,
    minTopPx,
    maxTopPx,
    stickerReservePx: LIFT_STICKER_RESERVE,
    gapPx: LIFT_GAP,
  });
}

type ControllerArgs = Required<
  Pick<
    PreviewTextStickerProps,
    | 'mode'
    | 'variant'
    | 'text'
    | 'fontSize'
    | 'textColor'
    | 'barColor'
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'monospace'
    | 'fontDesign'
    | 'preset'
    | 'align'
    | 'topPx'
    | 'minTopPx'
    | 'maxTopPx'
    | 'onTopPxChange'
    | 'onPressDisplay'
    | 'onConfirm'
    | 'onDelete'
    | 'exiting'
    | 'animateEnter'
  >
> & Pick<PreviewTextStickerProps, 'onExitComplete'>;

function resolveStickerTextStyle({
  italic,
  underline,
  strikethrough,
  monospace,
  fontDesign,
}: Pick<ControllerArgs, 'italic' | 'underline' | 'strikethrough' | 'monospace' | 'fontDesign'>) {
  const fontStyle = italic ? 'italic' : 'normal';
  const textDecorationLine: TextStyle['textDecorationLine'] =
    underline && strikethrough
      ? 'underline line-through'
      : underline
        ? 'underline'
        : strikethrough
          ? 'line-through'
          : 'none';
  const fontFamily = resolveMediaTextFontFamily({ monospace, fontDesign });
  return { fontStyle: fontStyle as TextStyle['fontStyle'], textDecorationLine, fontFamily };
}

export function usePreviewTextStickerController({
  mode,
  variant,
  text,
  fontSize,
  textColor,
  barColor,
  bold,
  italic,
  underline,
  strikethrough,
  monospace,
  fontDesign,
  preset,
  align,
  topPx,
  minTopPx,
  maxTopPx,
  onTopPxChange,
  onPressDisplay,
  onConfirm,
  onDelete,
  exiting,
  onExitComplete,
  animateEnter,
}: ControllerArgs) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const motionEnabled = useMotionEnabled();
  const inputRef = useRef<TextInput>(null);
  const didEnterRef = useRef(false);
  const formatLiftActiveRef = useRef(false);
  const formatLiftStartedRef = useRef(false);
  const formatOpenRef = useRef(false);
  const formatPresentationFrameRef = useRef<number | null>(null);
  const formatSheetHeightRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const exitingRef = useRef(exiting);
  const [formatOpen, setFormatOpen] = useState(false);
  const [formatSheetHeight, setFormatSheetHeight] = useState(0);
  const [barInnerWidth, setBarInnerWidth] = useState(0);
  const [placeholderWidth, setPlaceholderWidth] = useState(0);

  const translateY = useSharedValue(topPx);
  const restTop = useSharedValue(topPx);
  const dragStartY = useSharedValue(topPx);
  const trashVisible = useSharedValue(0);
  const overTrash = useSharedValue(false);
  const editProgress = useSharedValue(mode === 'editing' ? 1 : 0);
  const presence = useSharedValue(animateEnter && motionEnabled ? 0 : 1);
  const isEditing = mode === 'editing';
  const actionsReady = useSharedValue(isEditing && !animateEnter ? 1 : 0);

  const textAlign = align;
  const textStyleExtras = resolveStickerTextStyle({
    italic,
    underline,
    strikethrough,
    monospace,
    fontDesign,
  });
  const sheetPresented = isEditing && formatOpen;
  const placeholderText = t('preview.textPlaceholder');
  const emptyEditing = isEditing && text.length === 0;
  const emptyCaretPaddingLeft =
    emptyEditing && barInnerWidth > 0 && placeholderWidth > 0
      ? Math.min(
          barInnerWidth - BAR_TEXT_HORIZONTAL_PADDING,
          Math.max(BAR_TEXT_HORIZONTAL_PADDING, (barInnerWidth + placeholderWidth) / 2),
        )
      : undefined;
  const minimumBarHeight = captionMinimumBarHeight(variant, fontSize);

  useEffect(() => {
    formatOpenRef.current = formatOpen;
  }, [formatOpen]);

  useEffect(() => {
    exitingRef.current = exiting;
  }, [exiting]);

  useEffect(
    () => () => {
      if (formatPresentationFrameRef.current != null) {
        cancelAnimationFrame(formatPresentationFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (formatOpenRef.current) return;
    // A drop already placed the sticker (and may still be springing back from the trash
    // overdrag); only outside changes jump it.
    const fromDrop = Math.abs(restTop.get() - topPx) < 0.5;
    restTop.set(topPx);
    if (keyboardHeightRef.current >= 1 || fromDrop) return;
    translateY.set(topPx);
  }, [restTop, topPx, translateY]);

  useEffect(() => {
    if (didEnterRef.current) return;
    didEnterRef.current = true;
    if (!motionEnabled || !animateEnter) {
      presence.set(1);
      return;
    }
    presence.set(0);
    presence.set(withTiming(1, STICKER_PRESENCE_TIMING));
  }, [animateEnter, motionEnabled, presence]);

  useEffect(() => {
    if (!isEditing) {
      actionsReady.set(0);
      return;
    }
    if (!animateEnter || !motionEnabled) actionsReady.set(1);
  }, [actionsReady, animateEnter, isEditing, motionEnabled]);

  useLayoutEffect(() => {
    if (!isEditing || formatOpen) inputRef.current?.blur();
  }, [formatOpen, isEditing]);

  const openFormatSheet = () => {
    formatLiftActiveRef.current = true;
    formatLiftStartedRef.current = false;
    formatOpenRef.current = true;
    keyboardHeightRef.current = 0;
    inputRef.current?.blur();
    setFormatOpen(true);
    if (formatPresentationFrameRef.current != null) {
      cancelAnimationFrame(formatPresentationFrameRef.current);
    }
    formatPresentationFrameRef.current = requestAnimationFrame(() => {
      formatPresentationFrameRef.current = requestAnimationFrame(() => {
        formatPresentationFrameRef.current = null;
        if (!formatOpenRef.current) return;
        formatLiftStartedRef.current = true;
        animateFormatLift(
          translateY,
          sheetParkTop({
            sheetHeight: formatSheetHeightRef.current,
            windowHeight,
            minTopPx,
            maxTopPx,
          }),
          motionEnabled,
        );
      });
    });
  };

  const closeFormatSheet = () => {
    formatLiftActiveRef.current = false;
    formatLiftStartedRef.current = false;
    formatOpenRef.current = false;
    if (formatPresentationFrameRef.current != null) {
      cancelAnimationFrame(formatPresentationFrameRef.current);
      formatPresentationFrameRef.current = null;
    }
    setFormatOpen(false);
  };

  useEffect(() => {
    if (isEditing) return;
    formatLiftActiveRef.current = false;
    formatLiftStartedRef.current = false;
    formatOpenRef.current = false;
    keyboardHeightRef.current = 0;
    const resetFormatId = requestAnimationFrame(() => setFormatOpen(false));
    const restore = clampPreviewTextTopPx(restTop.get(), minTopPx, maxTopPx);
    animateFormatLift(translateY, restore, motionEnabled);
    return () => cancelAnimationFrame(resetFormatId);
  }, [isEditing, minTopPx, maxTopPx, motionEnabled, restTop, translateY]);

  useEffect(() => {
    const target = isEditing ? 1 : 0;
    if (!motionEnabled) {
      editProgress.set(target);
    } else if (isEditing) {
      editProgress.set(withSpring(1, appleUiSpring));
    } else {
      editProgress.set(
        withTiming(0, { duration: duration.medium, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [editProgress, isEditing, motionEnabled]);

  useEffect(() => {
    if (!formatOpen || !formatLiftActiveRef.current || !formatLiftStartedRef.current) return;
    if (formatSheetHeight <= 0) return;
    const target = sheetParkTop({
      sheetHeight: formatSheetHeight,
      windowHeight,
      minTopPx,
      maxTopPx,
    });
    if (Math.abs(translateY.get() - target) < FORMAT_PARK_REFINE_EPSILON) return;
    animateFormatLift(translateY, target, motionEnabled);
  }, [formatOpen, formatSheetHeight, maxTopPx, minTopPx, motionEnabled, translateY, windowHeight]);

  const applyKeyboardFrame = useEffectEvent((event: KeyboardEvent) => {
    if (exitingRef.current || formatOpenRef.current || formatLiftActiveRef.current) return;
    const kb = keyboardHeightFromEvent(event, windowHeight);
    if (kb < 1 && keyboardHeightRef.current < 1) return;
    keyboardHeightRef.current = kb;
    if (kb >= 1 && actionsReady.get() < 1) {
      actionsReady.set(
        withTiming(1, { duration: duration.fast, easing: Easing.out(Easing.cubic) }),
      );
    }
    const target = previewTextTopAboveObstacle({
      windowHeight,
      obstacleHeight: kb,
      minTopPx,
      maxTopPx,
      stickerReservePx: LIFT_STICKER_RESERVE,
      gapPx: LIFT_GAP,
    });
    const ms = Math.max(event.duration ?? 0, kb < 1 ? duration.slow : 0);
    if (!motionEnabled) {
      translateY.set(target);
      return;
    }
    translateY.set(
      withTiming(target, {
        duration: ms > 0 ? ms : duration.slow,
        easing: Easing.bezier(0.33, 0, 0.2, 1),
      }),
    );
  });

  const restoreAfterKeyboard = useEffectEvent(() => {
    const wasLifted = keyboardHeightRef.current >= 1;
    keyboardHeightRef.current = 0;
    if (
      wasLifted &&
      !exitingRef.current &&
      !formatOpenRef.current &&
      !formatLiftActiveRef.current
    ) {
      const restore = clampPreviewTextTopPx(restTop.get(), minTopPx, maxTopPx);
      animateFormatLift(translateY, restore, motionEnabled);
    }
  });

  /**
   * A system sheet presented over the first keyboard (the swipe-typing onboarding, a Face ID or
   * permission prompt) interrupts the enter animation and steals first responder; the keyboard
   * frame that reveals the action row may then never arrive. Every return of focus or keyboard
   * re-asserts the editing state so typed text, placeholder and actions are always visible.
   */
  const resyncEditingVisibility = () => {
    if (exitingRef.current || !isEditing) return;
    if (presence.get() < 1) {
      cancelAnimation(presence);
      presence.set(1);
    }
    if (editProgress.get() < 1) {
      cancelAnimation(editProgress);
      editProgress.set(1);
    }
    if (actionsReady.get() < 1) {
      cancelAnimation(actionsReady);
      actionsReady.set(1);
    }
  };
  const resyncFromSystemEvent = useEffectEvent(resyncEditingVisibility);

  useEffect(() => {
    if (!isEditing) return;
    const showSub = Keyboard.addListener('keyboardDidShow', () => resyncFromSystemEvent());
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      resyncFromSystemEvent();
      // The interrupting sheet resigned the input; give it back so typing keeps landing here.
      if (!formatOpenRef.current && !exitingRef.current) inputRef.current?.focus();
    });
    return () => {
      showSub.remove();
      appStateSub.remove();
    };
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing || formatOpen) {
      keyboardHeightRef.current = 0;
      return;
    }
    const sub = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      applyKeyboardFrame(event);
    });
    const focusId = requestAnimationFrame(() => {
      if (!formatOpenRef.current) inputRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(focusId);
      sub.remove();
      restoreAfterKeyboard();
    };
  }, [isEditing, formatOpen]);

  const notifyExitComplete = useEffectEvent(() => onExitComplete?.());

  useEffect(() => {
    if (!exiting) return;
    inputRef.current?.blur();
    formatLiftActiveRef.current = false;
    formatLiftStartedRef.current = false;
    formatOpenRef.current = false;
    keyboardHeightRef.current = 0;
    cancelAnimation(translateY);
    cancelAnimation(presence);
    if (!motionEnabled) {
      presence.set(0);
      notifyExitComplete();
      return;
    }
    presence.set(
      withTiming(0, STICKER_PRESENCE_TIMING, (finished) => {
        if (finished) scheduleOnRN(notifyExitComplete);
      }),
    );
  }, [exiting, motionEnabled, presence, translateY]);

  // Only a placed (display-mode) sticker can be dropped on the trash; while typing the trash
  // button in the action row deletes it.
  const canTrash = !isEditing && !exiting;
  const pan = Gesture.Pan()
    .enabled(!formatOpen)
    .minDistance(4)
    .onBegin(() => {
      'worklet';
      cancelAnimation(translateY);
      dragStartY.set(translateY.get());
    })
    .onStart(() => {
      'worklet';
      if (canTrash) trashVisible.set(motionEnabled ? withTiming(1, { duration: duration.fast }) : 1);
    })
    .onUpdate((event) => {
      'worklet';
      const rawNext = dragStartY.get() + event.translationY;
      const lowest = canTrash ? maxTopPx + TRASH_OVERDRAG_PX : maxTopPx;
      const next = Math.max(minTopPx, Math.min(lowest, rawNext));
      translateY.set(next);
      overTrash.set(canTrash && next - maxTopPx >= TRASH_ACTIVATE_PX);
    })
    .onEnd(() => {
      'worklet';
      if (overTrash.get()) {
        scheduleOnRN(onDelete);
        return;
      }
      const nextTopPx = Math.min(maxTopPx, translateY.get());
      if (nextTopPx !== translateY.get()) {
        translateY.set(motionEnabled ? withSpring(nextTopPx, DROP_SPRING) : nextTopPx);
      }
      restTop.set(nextTopPx);
      scheduleOnRN(onTopPxChange, nextTopPx);
    })
    .onFinalize(() => {
      'worklet';
      overTrash.set(false);
      trashVisible.set(motionEnabled ? withTiming(0, { duration: duration.fast }) : 0);
    });

  // Light tick at the moment the sticker crosses into the trash zone (the visual grows with it).
  useAnimatedReaction(
    () => overTrash.get(),
    (current, previous) => {
      if (current && previous === false) scheduleOnRN(trashTick);
    },
  );

  const tapDisplay = Gesture.Tap()
    .enabled(!isEditing)
    .onEnd(() => {
      'worklet';
      scheduleOnRN(onPressDisplay);
    });
  const composed = Gesture.Exclusive(pan, tapDisplay);

  const handleBackdropPress = () => {
    if (exiting) return;
    if (sheetPresented) closeFormatSheet();
    else onConfirm();
  };

  // A transform, not `top`: dragging must not re-run layout (and the bar's blur) every frame.
  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
    opacity: overTrash.get() ? 0.55 : 1,
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: editProgress.get() * presence.get() * actionsReady.get(),
  }));
  const contentPresenceStyle = useAnimatedStyle(() => ({ opacity: presence.get() }));
  const displayTextStyle = useAnimatedStyle(() => ({ opacity: 1 - editProgress.get() }));
  const inputTextStyle = useAnimatedStyle(() => ({ opacity: editProgress.get() }));

  const formatStyle: MediaTextOverlayStyle = {
    textColor,
    barColor,
    bold,
    italic,
    underline,
    strikethrough,
    monospace,
    fontDesign,
    preset,
    align,
  };

  const handleFormatSheetHeightChange = (height: number) => {
    formatSheetHeightRef.current = height;
    setFormatSheetHeight(height);
  };

  return {
    actionsStyle,
    trashVisible,
    trashActive: overTrash,
    trashZoneTopPx: maxTopPx + TRASH_ACTIVATE_PX,
    composed,
    contentPresenceStyle,
    displayTextStyle,
    emptyCaretPaddingLeft,
    emptyEditing,
    formatStyle,
    handleFormatSheetHeightChange,
    handleBackdropPress,
    handleInputFocus: resyncEditingVisibility,
    inputRef,
    inputTextStyle,
    isEditing,
    minimumBarHeight,
    openFormatSheet,
    closeFormatSheet,
    placeholderText,
    setBarInnerWidth,
    setPlaceholderWidth,
    sheetPresented,
    shellStyle,
    textAlign,
    textStyleExtras,
  };
}
