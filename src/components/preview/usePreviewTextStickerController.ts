import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, TextInput, useWindowDimensions, type KeyboardEvent, type TextStyle } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  cancelAnimation,
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
  clampPreviewTextTopPx,
  previewTextTopAboveObstacle,
} from '../../lib/mediaTextOverlayGeometry';
import type { PreviewTextStickerProps } from './PreviewTextSticker.types';

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
    | 'exiting'
    | 'animateEnter'
  >
> & Pick<PreviewTextStickerProps, 'onExitComplete'>;

export function usePreviewTextStickerController({
  mode,
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
  const editProgress = useSharedValue(mode === 'editing' ? 1 : 0);
  const presence = useSharedValue(animateEnter && motionEnabled ? 0 : 1);
  const isEditing = mode === 'editing';
  const actionsReady = useSharedValue(isEditing && !animateEnter ? 1 : 0);

  const textAlign = align;
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
  const sheetPresented = isEditing && formatOpen;
  const placeholderText = t('preview.textPlaceholder');
  const emptyEditing = isEditing && text.length === 0;
  const emptyCaretPaddingLeft =
    emptyEditing && barInnerWidth > 0 && placeholderWidth > 0
      ? Math.min(
          barInnerWidth - BAR_TEXT_HORIZONTAL_PADDING,
          Math.max(BAR_TEXT_HORIZONTAL_PADDING, (barInnerWidth + placeholderWidth) / 2)
        )
      : undefined;
  const minimumBarHeight = Math.max(44, fontSize + 20);

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
    []
  );

  useEffect(() => {
    if (formatOpenRef.current) return;
    restTop.set(topPx);
    if (keyboardHeightRef.current >= 1) return;
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
          motionEnabled
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
        withTiming(0, { duration: duration.medium, easing: Easing.out(Easing.cubic) })
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
  }, [
    formatOpen,
    formatSheetHeight,
    maxTopPx,
    minTopPx,
    motionEnabled,
    translateY,
    windowHeight,
  ]);

  const applyKeyboardFrame = useEffectEvent((event: KeyboardEvent) => {
    if (exitingRef.current || formatOpenRef.current || formatLiftActiveRef.current) return;
    const kb = keyboardHeightFromEvent(event, windowHeight);
    if (kb < 1 && keyboardHeightRef.current < 1) return;
    keyboardHeightRef.current = kb;
    if (kb >= 1 && actionsReady.get() < 1) {
      actionsReady.set(
        withTiming(1, { duration: duration.fast, easing: Easing.out(Easing.cubic) })
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
      })
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
      })
    );
  }, [exiting, motionEnabled, presence, translateY]);

  const pan = Gesture.Pan()
    .enabled(!formatOpen)
    .minDistance(4)
    .onBegin(() => {
      'worklet';
      dragStartY.set(translateY.get());
    })
    .onUpdate((event) => {
      'worklet';
      const rawNext = dragStartY.get() + event.translationY;
      translateY.set(Math.max(minTopPx, Math.min(maxTopPx, rawNext)));
    })
    .onEnd(() => {
      'worklet';
      const nextTopPx = translateY.get();
      restTop.set(nextTopPx);
      scheduleOnRN(onTopPxChange, nextTopPx);
    });

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

  const shellStyle = useAnimatedStyle(() => ({ top: translateY.get() }));
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
  const textStyleExtras = {
    fontStyle: fontStyle as TextStyle['fontStyle'],
    textDecorationLine,
    fontFamily,
  };

  const handleFormatSheetHeightChange = (height: number) => {
    formatSheetHeightRef.current = height;
    setFormatSheetHeight(height);
  };

  return {
    actionsStyle,
    composed,
    contentPresenceStyle,
    displayTextStyle,
    emptyCaretPaddingLeft,
    emptyEditing,
    formatStyle,
    handleFormatSheetHeightChange,
    handleBackdropPress,
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
