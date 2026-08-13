import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
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
import { useAppTheme } from '../../hooks/useAppTheme';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { tap } from '../../lib/haptics';
import { appleUiSpring, duration, useMotionEnabled } from '../../theme/motion';
import type { PreviewTextStylePatch } from '../../hooks/usePreviewTextOverlay';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  type MediaTextAlign,
  type MediaTextFontDesign,
  type MediaTextOverlayStyle,
  type MediaTextPreset,
} from '../../types/mediaTextOverlay';
import { resolveMediaTextFontFamily } from '../../theme/mediaTextOverlayFonts';
import { PreviewTextGlassBar } from './PreviewTextGlassBar';
import {
  PreviewTextFormatSheet,
  placeholderColorForText,
} from './PreviewTextFormatSheet';
import {
  clampPreviewTextTopPx,
  previewTextTopAboveObstacle,
} from '../../lib/mediaTextOverlayGeometry';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** Fallback until sheet onLayout reports real height. */
const FORMAT_SHEET_FALLBACK_HEIGHT = 380;
/** Ignore tiny park corrections that read as a micro-jump. */
const FORMAT_PARK_REFINE_EPSILON = 10;
/** Actions row + caption bar height above keyboard / sheet. */
const LIFT_STICKER_RESERVE = 118;
/** Breathing room between caption bar bottom and keyboard / sheet top. */
const LIFT_GAP = 32;
const BAR_TEXT_HORIZONTAL_PADDING = 4;
const STICKER_PRESENCE_TIMING = {
  duration: duration.medium,
  easing: Easing.out(Easing.cubic),
} as const;
/**
 * Sheet-matched settle — no overshoot (iOS sheet ~350ms feel).
 * overshootClamping keeps spring feel without bounce past the target.
 */
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

function useLatestCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void
): (...args: TArgs) => void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}

export type PreviewTextStickerMode = 'display' | 'editing';

type PreviewTextStickerProps = {
  mode: PreviewTextStickerMode;
  text: string;
  fontSize: number;
  textColor?: string;
  barColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  monospace?: boolean;
  fontDesign?: MediaTextFontDesign;
  preset?: MediaTextPreset;
  align?: MediaTextAlign;
  topPx: number;
  minTopPx: number;
  maxTopPx: number;
  onTopPxChange: (topPx: number) => void;
  onChangeText: (text: string) => void;
  onChangeStyle?: (patch: PreviewTextStylePatch) => void;
  onPressDisplay: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
  exiting?: boolean;
  onExitComplete?: () => void;
  /** Scale-in when mounting committed sticker in display mode. Skip on "Add text". */
  animateEnter?: boolean;
  style?: StyleProp<ViewStyle>;
};

function decorationLine(
  underline: boolean,
  strikethrough: boolean
): TextStyle['textDecorationLine'] {
  if (underline && strikethrough) return 'underline line-through';
  if (underline) return 'underline';
  if (strikethrough) return 'line-through';
  return 'none';
}

export function PreviewTextSticker({
  mode,
  text,
  fontSize,
  textColor = DEFAULT_MEDIA_TEXT_COLOR,
  barColor = DEFAULT_MEDIA_TEXT_BAR_COLOR,
  bold = true,
  italic = false,
  underline = false,
  strikethrough = false,
  monospace = false,
  fontDesign = 'system',
  preset = 'title',
  align = 'center',
  topPx,
  minTopPx,
  maxTopPx,
  onTopPxChange,
  onChangeText,
  onChangeStyle,
  onPressDisplay,
  onConfirm,
  onCancel: _onCancel,
  onDelete,
  exiting = false,
  onExitComplete,
  animateEnter = false,
  style,
}: PreviewTextStickerProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const motionEnabled = useMotionEnabled();
  const inputRef = useRef<TextInput>(null);
  const didEnterRef = useRef(false);
  const restTopRef = useRef(topPx);
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
  const dragStartY = useSharedValue(topPx);
  const editProgress = useSharedValue(mode === 'editing' ? 1 : 0);
  const presence = useSharedValue(animateEnter && motionEnabled ? 0 : 1);

  const isEditing = mode === 'editing';
  const actionsReady = useSharedValue(isEditing && !animateEnter ? 1 : 0);
  const fontWeight = bold ? '700' : '400';
  const textAlign = align;
  const fontStyle = italic ? 'italic' : 'normal';
  const textDecorationLine = decorationLine(underline, strikethrough);
  const fontFamily = resolveMediaTextFontFamily({ monospace, fontDesign });
  const sheetPresented = isEditing && formatOpen;
  const placeholderText = t('preview.textPlaceholder');
  const emptyEditing = isEditing && text.length === 0;
  const emptyCaretPaddingLeft =
    emptyEditing && barInnerWidth > 0 && placeholderWidth > 0
      ? Math.min(
          barInnerWidth - BAR_TEXT_HORIZONTAL_PADDING,
          Math.max(
            BAR_TEXT_HORIZONTAL_PADDING,
            (barInnerWidth + placeholderWidth) / 2
          )
        )
      : undefined;
  const minimumBarHeight = Math.max(48, fontSize * 1.25 + 20);

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

  // Sync committed Y only when topPx changes — never on keyboard open/close
  // (that would cancel the restore timing and snap).
  useEffect(() => {
    if (formatOpenRef.current) return;
    restTopRef.current = topPx;
    if (keyboardHeightRef.current >= 1) return;
    translateY.set(topPx);
  }, [topPx, translateY]);

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
    if (!animateEnter || !motionEnabled) {
      actionsReady.set(1);
    }
  }, [actionsReady, animateEnter, isEditing, motionEnabled]);

  useLayoutEffect(() => {
    // Blur only here — focus after keyboard listener is attached (see below).
    if (!isEditing || formatOpen) {
      inputRef.current?.blur();
    }
  }, [formatOpen, isEditing]);

  const computeSheetParkTop = useCallback(
    (sheetH = formatSheetHeight) => {
      const height = sheetH > 0 ? sheetH : FORMAT_SHEET_FALLBACK_HEIGHT;
      return previewTextTopAboveObstacle({
        windowHeight,
        obstacleHeight: height,
        minTopPx,
        maxTopPx,
        stickerReservePx: LIFT_STICKER_RESERVE,
        gapPx: LIFT_GAP,
      });
    },
    [formatSheetHeight, windowHeight, minTopPx, maxTopPx]
  );

  /** Fixed gap above keyboard — same as format sheet (may move up OR down). */
  const parkForKeyboard = useCallback(
    (kb: number) => {
      if (kb < 1) return restTopRef.current;
      return previewTextTopAboveObstacle({
        windowHeight,
        obstacleHeight: kb,
        minTopPx,
        maxTopPx,
        stickerReservePx: LIFT_STICKER_RESERVE,
        gapPx: LIFT_GAP,
      });
    },
    [windowHeight, minTopPx, maxTopPx]
  );

  const openFormatSheet = useCallback(() => {
    formatLiftActiveRef.current = true;
    formatLiftStartedRef.current = false;
    formatOpenRef.current = true;
    keyboardHeightRef.current = 0;
    inputRef.current?.blur();
    setFormatOpen(true);

    if (formatPresentationFrameRef.current != null) {
      cancelAnimationFrame(formatPresentationFrameRef.current);
    }
    // Let the native sheet mount and report its real height before moving the sticker.
    formatPresentationFrameRef.current = requestAnimationFrame(() => {
      formatPresentationFrameRef.current = requestAnimationFrame(() => {
        formatPresentationFrameRef.current = null;
        if (!formatOpenRef.current) return;
        formatLiftStartedRef.current = true;
        animateFormatLift(
          translateY,
          computeSheetParkTop(formatSheetHeightRef.current),
          motionEnabled
        );
      });
    });
  }, [computeSheetParkTop, motionEnabled, translateY]);

  const closeFormatSheet = useCallback(() => {
    // Stay at sheet park — keyboard open drives a single frame-synced move to kb park.
    // Avoid home detour (rest → keyboard) that felt like a double animation.
    formatLiftActiveRef.current = false;
    formatLiftStartedRef.current = false;
    formatOpenRef.current = false;
    if (formatPresentationFrameRef.current != null) {
      cancelAnimationFrame(formatPresentationFrameRef.current);
      formatPresentationFrameRef.current = null;
    }
    setFormatOpen(false);
  }, []);

  useEffect(() => {
    if (isEditing) return;
    formatLiftActiveRef.current = false;
    formatLiftStartedRef.current = false;
    formatOpenRef.current = false;
    keyboardHeightRef.current = 0;
    const resetFormatId = requestAnimationFrame(() => setFormatOpen(false));
    const restore = clampPreviewTextTopPx(restTopRef.current, minTopPx, maxTopPx);
    animateFormatLift(translateY, restore, motionEnabled);
    return () => cancelAnimationFrame(resetFormatId);
  }, [isEditing, minTopPx, maxTopPx, motionEnabled, translateY]);

  useEffect(() => {
    const target = isEditing ? 1 : 0;
    if (!motionEnabled) {
      editProgress.set(target);
      return;
    }

    if (isEditing) {
      editProgress.set(withSpring(1, appleUiSpring));
      return;
    }

    editProgress.set(
      withTiming(0, {
        duration: duration.medium,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [editProgress, isEditing, motionEnabled]);

  // Park (or refine) once we know sheet height — skip tiny corrections.
  useEffect(() => {
    if (!formatOpen || !formatLiftActiveRef.current || !formatLiftStartedRef.current) return;
    if (formatSheetHeight <= 0) return;
    const target = computeSheetParkTop(formatSheetHeight);
    if (Math.abs(translateY.get() - target) < FORMAT_PARK_REFINE_EPSILON) return;
    animateFormatLift(translateY, target, motionEnabled);
  }, [formatOpen, formatSheetHeight, computeSheetParkTop, motionEnabled, translateY]);

  // Park above keyboard like format sheet — iOS keyboardWillChangeFrame (synced duration).
  useEffect(() => {
    if (!isEditing || formatOpen) {
      keyboardHeightRef.current = 0;
      return;
    }

    const applyFrame = (event: KeyboardEvent) => {
      if (exitingRef.current || formatOpenRef.current || formatLiftActiveRef.current) return;
      const kb = keyboardHeightFromEvent(event, windowHeight);
      // Ignore leading kb=0 after Format→keyboard so we don't detour via home first.
      if (kb < 1 && keyboardHeightRef.current < 1) return;

      keyboardHeightRef.current = kb;
      if (kb >= 1 && actionsReady.get() < 1) {
        actionsReady.set(
          withTiming(1, {
            duration: duration.fast,
            easing: Easing.out(Easing.cubic),
          })
        );
      }
      const target = clampPreviewTextTopPx(parkForKeyboard(kb), minTopPx, maxTopPx);
      // iOS sometimes reports 0 duration on the final hide frame — keep a soft settle.
      const ms = Math.max(event.duration ?? 0, kb < 1 ? duration.slow : 0);
      if (!motionEnabled) {
        translateY.set(target);
        return;
      }
      translateY.set(
        withTiming(target, {
          duration: ms > 0 ? ms : duration.slow,
          easing: Easing.bezier(0.33, 0.0, 0.2, 1),
        })
      );
    };

    const sub = Keyboard.addListener('keyboardWillChangeFrame', applyFrame);

    // Focus after subscribe so we don't miss the opening frame event.
    const focusId = requestAnimationFrame(() => {
      if (!formatOpenRef.current) {
        inputRef.current?.focus();
      }
    });

    return () => {
      cancelAnimationFrame(focusId);
      sub.remove();
      const wasLifted = keyboardHeightRef.current >= 1;
      keyboardHeightRef.current = 0;
      // Soft return when leaving edit / opening format already owns translateY.
      if (
        wasLifted &&
        !exitingRef.current &&
        !formatOpenRef.current &&
        !formatLiftActiveRef.current
      ) {
        const restore = clampPreviewTextTopPx(restTopRef.current, minTopPx, maxTopPx);
        animateFormatLift(translateY, restore, motionEnabled);
      }
    };
  }, [
    isEditing,
    formatOpen,
    windowHeight,
    minTopPx,
    maxTopPx,
    parkForKeyboard,
    motionEnabled,
    actionsReady,
    translateY,
  ]);

  const commitTopPx = useCallback(
    (nextY: number) => {
      restTopRef.current = nextY;
      onTopPxChange(nextY);
    },
    [onTopPxChange]
  );
  const commitTopPxBridge = useLatestCallback(commitTopPx);
  const handleFormatSheetHeightChange = useCallback((height: number) => {
    formatSheetHeightRef.current = height;
    setFormatSheetHeight(height);
  }, []);
  const exitCompleteBridge = useLatestCallback(() => {
    onExitComplete?.();
  });

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
      exitCompleteBridge();
      return;
    }

    presence.set(
      withTiming(
        0,
        STICKER_PRESENCE_TIMING,
        (finished) => {
          if (finished) scheduleOnRN(exitCompleteBridge);
        }
      )
    );
  }, [exitCompleteBridge, exiting, motionEnabled, presence, translateY]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!formatOpen)
        .minDistance(4)
        .onBegin(() => {
          'worklet';
          dragStartY.set(translateY.get());
        })
        .onUpdate((event) => {
          'worklet';
          const rawNext = dragStartY.get() + event.translationY;
          const next = Math.max(minTopPx, Math.min(maxTopPx, rawNext));
          translateY.set(next);
        })
        .onEnd(() => {
          'worklet';
          scheduleOnRN(commitTopPxBridge, translateY.get());
        }),
    [commitTopPxBridge, dragStartY, formatOpen, maxTopPx, minTopPx, translateY]
  );

  const tapDisplay = useMemo(
    () =>
      Gesture.Tap()
        .enabled(!isEditing)
        .onEnd(() => {
          'worklet';
          scheduleOnRN(onPressDisplay);
        }),
    [isEditing, onPressDisplay]
  );

  const composed = useMemo(() => Gesture.Exclusive(pan, tapDisplay), [pan, tapDisplay]);

  const handleBackdropTap = useCallback(() => {
    if (exiting) return;
    if (sheetPresented) {
      closeFormatSheet();
      return;
    }
    onConfirm();
  }, [closeFormatSheet, exiting, onConfirm, sheetPresented]);

  const handleBackdropTapBridge = useLatestCallback(handleBackdropTap);

  const backdropTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(isEditing)
        .onEnd(() => {
          'worklet';
          scheduleOnRN(handleBackdropTapBridge);
        }),
    [handleBackdropTapBridge, isEditing]
  );

  const shellStyle = useAnimatedStyle(() => ({
    top: translateY.get(),
  }));

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: editProgress.get() * presence.get() * actionsReady.get(),
  }));

  const contentPresenceStyle = useAnimatedStyle(() => ({
    opacity: presence.get(),
  }));

  const displayTextStyle = useAnimatedStyle(() => ({
    opacity: 1 - editProgress.get(),
  }));

  const inputTextStyle = useAnimatedStyle(() => ({
    opacity: editProgress.get(),
  }));

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

  return (
    <>
      {isEditing ? (
        <GestureDetector gesture={backdropTap}>
          <View
            style={styles.editBackdrop}
            accessibilityRole="button"
            accessibilityLabel={sheetPresented ? t('common.cancel') : t('preview.textDone')}
          />
        </GestureDetector>
      ) : null}

      <GestureDetector gesture={composed}>
        <Animated.View
          style={[styles.shell, shellStyle, style]}
          pointerEvents="box-none"
          accessibilityRole={!isEditing ? 'button' : undefined}
          accessibilityLabel={!isEditing ? text : undefined}>
          <View style={[styles.stickerWidth, { minHeight: minimumBarHeight }]}>
            <Animated.View
              style={[styles.actionsRow, actionsStyle]}
              pointerEvents={isEditing && !exiting ? 'auto' : 'none'}>
              <View style={styles.actionSlot}>
                <NativeChromeIconButton
                  name="textFormat"
                  accessibilityLabel={t('preview.textFormat')}
                  onPress={() => {
                    tap('light');
                    openFormatSheet();
                  }}
                  backgroundColor={colors.cameraControlBackground}
                  tintColor={colors.cameraControlTint}
                  chromeVariant="glass"
                />
              </View>
              <View pointerEvents="none" style={styles.actionsSpacer} />
              <View style={styles.actionSlot}>
                <NativeChromeIconButton
                  name="trash"
                  accessibilityLabel={t('preview.deleteText')}
                  onPress={() => {
                    tap('light');
                    onDelete();
                  }}
                  backgroundColor={colors.cameraControlBackground}
                  tintColor={colors.destructive}
                  chromeVariant="glass"
                />
              </View>
            </Animated.View>

            <PreviewTextGlassBar
              style={[styles.barWidth, { minHeight: minimumBarHeight }]}
              isInteractive
              barColor={barColor}
              visible={!exiting}
              animateEnter={animateEnter && motionEnabled}
              transitionDurationMs={STICKER_PRESENCE_TIMING.duration}>
              <View
                style={[styles.barInner, { minHeight: fontSize * 1.25 }]}
                onLayout={(event) => setBarInnerWidth(event.nativeEvent.layout.width)}>
                <Animated.View style={[styles.barContentLayer, contentPresenceStyle]}>
                  {emptyEditing ? (
                    <Text
                      pointerEvents="none"
                      style={[
                        styles.fakePlaceholder,
                        {
                          color: placeholderColorForText(textColor),
                          fontSize,
                          lineHeight: fontSize * 1.2,
                          fontWeight,
                          textAlign,
                          ...textStyleExtras,
                        },
                      ]}>
                      {placeholderText}
                    </Text>
                  ) : null}
                  {emptyEditing ? (
                    <Text
                      pointerEvents="none"
                      onLayout={(event) => setPlaceholderWidth(event.nativeEvent.layout.width)}
                      style={[
                        styles.placeholderMeasure,
                        {
                          fontSize,
                          lineHeight: fontSize * 1.2,
                          fontWeight,
                          ...textStyleExtras,
                        },
                      ]}>
                      {placeholderText}
                    </Text>
                  ) : null}
                  <Animated.Text
                    style={[
                      styles.displayText,
                      {
                        fontSize,
                        lineHeight: fontSize * 1.2,
                        color: textColor,
                        fontWeight,
                        textAlign,
                        ...textStyleExtras,
                      },
                      displayTextStyle,
                    ]}
                    pointerEvents={isEditing ? 'none' : 'auto'}>
                    {text || ' '}
                  </Animated.Text>
                  <AnimatedTextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={onChangeText}
                    placeholder=""
                    style={[
                      styles.input,
                      styles.inputLayer,
                      inputTextStyle,
                      emptyCaretPaddingLeft != null
                        ? { paddingLeft: emptyCaretPaddingLeft, paddingRight: BAR_TEXT_HORIZONTAL_PADDING }
                        : null,
                      {
                        color: textColor,
                        fontSize,
                        lineHeight: fontSize * 1.25,
                        fontWeight,
                        textAlign: emptyEditing ? 'left' : textAlign,
                        ...textStyleExtras,
                      },
                    ]}
                    editable={isEditing && !formatOpen}
                    pointerEvents={isEditing && !formatOpen && !exiting ? 'auto' : 'none'}
                    multiline
                    maxLength={200}
                    textAlign={textAlign}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={onConfirm}
                    accessibilityLabel={placeholderText}
                    showSoftInputOnFocus={isEditing && !formatOpen && !exiting}
                  />
                </Animated.View>
              </View>
            </PreviewTextGlassBar>
          </View>
        </Animated.View>
      </GestureDetector>

      {onChangeStyle ? (
        <PreviewTextFormatSheet
          isPresented={sheetPresented}
          onDismiss={closeFormatSheet}
          style={formatStyle}
          onChangeStyle={onChangeStyle}
          onContentHeightChange={handleFormatSheetHeightChange}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
    paddingHorizontal: 16,
  },
  editBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 15,
  },
  stickerWidth: {
    width: '90%',
    alignSelf: 'center',
    position: 'relative',
  },
  barWidth: {
    width: '100%',
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  actionsRow: {
    position: 'absolute',
    top: -58,
    left: 0,
    right: 0,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  actionsSpacer: {
    flex: 1,
  },
  actionSlot: {
    width: 48,
    height: 48,
  },
  barInner: {
    position: 'relative',
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: BAR_TEXT_HORIZONTAL_PADDING,
  },
  barContentLayer: {
    position: 'relative',
    minHeight: '100%',
    justifyContent: 'center',
  },
  fakePlaceholder: {
    ...StyleSheet.absoluteFill,
    fontWeight: '700',
  },
  placeholderMeasure: {
    position: 'absolute',
    opacity: 0,
    fontWeight: '700',
  },
  displayText: {
    color: DEFAULT_MEDIA_TEXT_COLOR,
    fontWeight: '700',
    textAlign: 'center',
  },
  input: {
    fontWeight: '700',
    padding: 0,
    margin: 0,
  },
  inputLayer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
  },
});
