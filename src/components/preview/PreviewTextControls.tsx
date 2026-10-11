import { type ReactNode, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { NativeChromeIconButton, type ChromeVariant } from '../ui/native-chrome-icon-button';
import { PreviewTextSticker } from './PreviewTextSticker';
import { supportsMediaTextCaptionBar } from '../../../modules/nix-media-overlay';
import { usePreviewTextOverlay } from '../../hooks/usePreviewTextOverlay';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE,
  DEFAULT_MEDIA_TEXT_OVERLAY_Y,
  resolveMediaTextRenderStyle,
  type MediaTextOverlay,
  type MediaTextVariant,
} from '../../types/mediaTextOverlay';
import type { ThemeColors } from '../../theme/colors';
import { appleUiSpring, duration, useMotionEnabled } from '../../theme/motion';

export type PreviewTextChromeSlots = {
  /** Always rendered; fade/disable while editing. */
  textButton: ReactNode;
  isEditing: boolean;
};

type PreviewTextToolsProps = {
  overlay: MediaTextOverlay | null | undefined;
  onChangeOverlay: (next: MediaTextOverlay | null) => void;
  clampTopPx: number;
  clampBottomPx: number;
  viewportHeight?: number;
  /** Visible media frame in the sticker layer's coordinates (see usePreviewTextOverlay). */
  mediaFrame?: { top: number; height: number };
  stickerViewportStyle?: StyleProp<ViewStyle>;
  colors: ThemeColors;
  chromeVariant?: ChromeVariant;
  /** Renders chrome; Text button is placed top-right by the parent. */
  renderChrome: (slots: PreviewTextChromeSlots) => ReactNode;
  renderTextButton?: (startEditing: () => void) => ReactNode;
  stickerPointerEvents?: 'box-none' | 'none';
};

function resolveStickerContent(
  controls: ReturnType<typeof usePreviewTextOverlay>,
  captionBarAvailable: boolean,
) {
  const source = controls.isEditing ? controls.editor : controls.committed;
  const stickerText = controls.isEditing
    ? (controls.editor?.draftText ?? '')
    : (controls.committed?.text ?? '');
  // Without the native bar bake every caption is shown (and baked) as a sticker.
  const stickerVariant: MediaTextVariant =
    captionBarAvailable && source?.variant === 'bar' ? 'bar' : 'sticker';
  // The bar draws its fixed look; the sticker format stays on the overlay for switching back.
  const drawn = source ? resolveMediaTextRenderStyle({ ...source, variant: stickerVariant }) : null;
  const stickerFontSize = drawn?.fontSize ?? DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE;
  const stickerY = source?.y ?? DEFAULT_MEDIA_TEXT_OVERLAY_Y;
  const stickerTextColor = drawn?.textColor ?? DEFAULT_MEDIA_TEXT_COLOR;
  const stickerBarColor = drawn?.barColor ?? DEFAULT_MEDIA_TEXT_BAR_COLOR;
  const stickerBold = drawn?.bold ?? true;
  const stickerItalic = drawn?.italic ?? false;
  const stickerUnderline = drawn?.underline ?? false;
  const stickerStrikethrough = drawn?.strikethrough ?? false;
  const stickerMonospace = drawn?.monospace ?? false;
  const stickerFontDesign = drawn?.fontDesign ?? 'system';
  const stickerPreset = source?.preset ?? 'title';
  const stickerAlign = drawn?.align ?? 'center';

  return {
    stickerVariant,
    stickerText,
    stickerFontSize,
    stickerY,
    stickerTextColor,
    stickerBarColor,
    stickerBold,
    stickerItalic,
    stickerUnderline,
    stickerStrikethrough,
    stickerMonospace,
    stickerFontDesign,
    stickerPreset,
    stickerAlign,
  };
}

export function PreviewTextTools({
  overlay,
  onChangeOverlay,
  clampTopPx,
  clampBottomPx,
  viewportHeight,
  mediaFrame,
  stickerViewportStyle,
  colors,
  chromeVariant = 'glass',
  renderChrome,
  renderTextButton,
  stickerPointerEvents = 'box-none',
}: PreviewTextToolsProps) {
  const { t } = useTranslation();
  const motionEnabled = useMotionEnabled();
  const [barHeight, setBarHeight] = useState(0);
  const captionBarAvailable = supportsMediaTextCaptionBar();
  const controls = usePreviewTextOverlay({
    overlay,
    onChangeOverlay,
    clampTopPx,
    clampBottomPx,
    viewportHeight,
    mediaFrame,
    barHeight,
    captionBarAvailable,
  });
  const [stickerExiting, setStickerExiting] = useState(false);
  const stickerExitActionRef = useRef<'confirm' | 'delete' | null>(null);

  const minTop = clampTopPx;
  const maxTop = clampTopPx + controls.usableHeight;
  const showSticker = controls.isEditing || Boolean(controls.committed);
  const mode = controls.isEditing ? 'editing' : 'display';
  const animateEnter = mode === 'display' || (controls.isEditing && !controls.committed);

  const textBtnOpacity = useSharedValue(controls.isEditing ? 0 : 1);

  useEffect(() => {
    const target = controls.isEditing ? 0 : 1;
    if (!motionEnabled) {
      textBtnOpacity.set(target);
      return;
    }
    if (target === 0) {
      textBtnOpacity.set(
        withTiming(0, { duration: duration.fast, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      textBtnOpacity.set(withSpring(1, appleUiSpring));
    }
  }, [controls.isEditing, motionEnabled, textBtnOpacity]);

  const textButtonStyle = useAnimatedStyle(() => ({
    opacity: textBtnOpacity.get(),
  }));

  const confirmEditing = () => {
    if (stickerExitActionRef.current) return;
    const isEmptyDraft = (controls.editor?.draftText.trim().length ?? 0) === 0;
    if (controls.isEditing && isEmptyDraft && motionEnabled) {
      stickerExitActionRef.current = 'confirm';
      setStickerExiting(true);
      return;
    }
    controls.confirmEditing();
  };

  const deleteSticker = () => {
    if (stickerExitActionRef.current) return;
    if (!motionEnabled) {
      controls.removeOverlay();
      return;
    }
    stickerExitActionRef.current = 'delete';
    setStickerExiting(true);
  };

  const completeStickerExit = () => {
    const action = stickerExitActionRef.current;
    stickerExitActionRef.current = null;
    setStickerExiting(false);
    if (action === 'delete') {
      controls.removeOverlay();
      return;
    }
    controls.confirmEditing();
  };

  const textButton = (
    <Animated.View style={textButtonStyle} pointerEvents={controls.isEditing ? 'none' : 'auto'}>
      {renderTextButton ? (
        renderTextButton(controls.startEditing)
      ) : (
        <NativeChromeIconButton
          name="textFormat"
          accessibilityLabel={t('preview.addText')}
          onPress={controls.startEditing}
          disabled={controls.isEditing}
          backgroundColor={colors.cameraControlBackground}
          tintColor={colors.cameraControlTint}
          chromeVariant={chromeVariant}
        />
      )}
    </Animated.View>
  );

  const {
    stickerVariant,
    stickerText,
    stickerFontSize,
    stickerY,
    stickerTextColor,
    stickerBarColor,
    stickerBold,
    stickerItalic,
    stickerUnderline,
    stickerStrikethrough,
    stickerMonospace,
    stickerFontDesign,
    stickerPreset,
    stickerAlign,
  } = resolveStickerContent(controls, captionBarAvailable);

  return (
    <>
      <View
        style={[StyleSheet.absoluteFill, stickerViewportStyle]}
        pointerEvents={stickerPointerEvents}>
        {showSticker ? (
          <PreviewTextSticker
            mode={mode}
            variant={stickerVariant}
            onChangeVariant={
              controls.isEditing && captionBarAvailable ? controls.setDraftVariant : undefined
            }
            text={stickerText}
            fontSize={stickerFontSize}
            textColor={stickerTextColor}
            barColor={stickerBarColor}
            bold={stickerBold}
            italic={stickerItalic}
            underline={stickerUnderline}
            strikethrough={stickerStrikethrough}
            monospace={stickerMonospace}
            fontDesign={stickerFontDesign}
            preset={stickerPreset}
            align={stickerAlign}
            topPx={controls.yToTopPx(stickerY)}
            minTopPx={minTop}
            maxTopPx={maxTop}
            animateEnter={animateEnter}
            onBarHeightChange={(height) => {
              if (Math.abs(height - barHeight) >= 0.5) setBarHeight(height);
            }}
            onTopPxChange={(top) =>
              controls.setY(controls.topPxToY(top), controls.isEditing ? 'editor' : 'committed')
            }
            onChangeText={controls.setDraftText}
            onChangeStyle={controls.isEditing ? controls.patchDraftStyle : undefined}
            onPressDisplay={controls.startEditing}
            onConfirm={confirmEditing}
            onCancel={controls.cancelEditing}
            onDelete={deleteSticker}
            exiting={stickerExiting}
            onExitComplete={completeStickerExit}
          />
        ) : null}
      </View>
      {renderChrome({ textButton, isEditing: controls.isEditing })}
    </>
  );
}
