import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
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
import { usePreviewTextOverlay } from '../../hooks/usePreviewTextOverlay';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE,
  DEFAULT_MEDIA_TEXT_OVERLAY_Y,
  type MediaTextOverlay,
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
  colors: ThemeColors;
  chromeVariant?: ChromeVariant;
  /** Renders chrome; Text button is placed top-right by the parent. */
  renderChrome: (slots: PreviewTextChromeSlots) => ReactNode;
};

export function PreviewTextTools({
  overlay,
  onChangeOverlay,
  clampTopPx,
  clampBottomPx,
  colors,
  chromeVariant = 'glass',
  renderChrome,
}: PreviewTextToolsProps) {
  const { t } = useTranslation();
  const motionEnabled = useMotionEnabled();
  const controls = usePreviewTextOverlay({
    overlay,
    onChangeOverlay,
    clampTopPx,
    clampBottomPx,
  });
  const [stickerExiting, setStickerExiting] = useState(false);
  const stickerExitPendingRef = useRef(false);

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
        withTiming(0, { duration: duration.fast, easing: Easing.out(Easing.cubic) })
      );
    } else {
      textBtnOpacity.set(withSpring(1, appleUiSpring));
    }
  }, [controls.isEditing, motionEnabled, textBtnOpacity]);

  const textButtonStyle = useAnimatedStyle(() => ({
    opacity: textBtnOpacity.get(),
  }));

  const confirmEditing = useCallback(() => {
    if (stickerExitPendingRef.current) return;
    const isEmptyDraft = (controls.editor?.draftText.trim().length ?? 0) === 0;
    if (controls.isEditing && isEmptyDraft && motionEnabled) {
      stickerExitPendingRef.current = true;
      setStickerExiting(true);
      return;
    }
    controls.confirmEditing();
  }, [controls, motionEnabled]);

  const completeStickerExit = useCallback(() => {
    stickerExitPendingRef.current = false;
    setStickerExiting(false);
    controls.confirmEditing();
  }, [controls]);

  const textButton = (
    <Animated.View
      style={textButtonStyle}
      pointerEvents={controls.isEditing ? 'none' : 'auto'}>
      <NativeChromeIconButton
        name="textFormat"
        accessibilityLabel={t('preview.addText')}
        onPress={controls.startEditing}
        disabled={controls.isEditing}
        backgroundColor={colors.cameraControlBackground}
        tintColor={colors.cameraControlTint}
        chromeVariant={chromeVariant}
      />
    </Animated.View>
  );

  const source = controls.isEditing ? controls.editor : controls.committed;
  const stickerText = controls.isEditing
    ? (controls.editor?.draftText ?? '')
    : (controls.committed?.text ?? '');
  const stickerFontSize = source?.fontSize ?? DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE;
  const stickerY = source?.y ?? DEFAULT_MEDIA_TEXT_OVERLAY_Y;
  const stickerTextColor = source?.textColor ?? DEFAULT_MEDIA_TEXT_COLOR;
  const stickerBarColor = source?.barColor ?? DEFAULT_MEDIA_TEXT_BAR_COLOR;
  const stickerBold = source?.bold ?? true;
  const stickerItalic = source?.italic ?? false;
  const stickerUnderline = source?.underline ?? false;
  const stickerStrikethrough = source?.strikethrough ?? false;
  const stickerMonospace = source?.monospace ?? false;
  const stickerFontDesign = source?.fontDesign ?? 'system';
  const stickerPreset = source?.preset ?? 'title';
  const stickerAlign = source?.align ?? 'center';

  return (
    <>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {showSticker ? (
          <PreviewTextSticker
            mode={mode}
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
            onTopPxChange={(top) =>
              controls.setY(controls.topPxToY(top), controls.isEditing ? 'editor' : 'committed')
            }
            onChangeText={controls.setDraftText}
            onChangeStyle={controls.isEditing ? controls.patchDraftStyle : undefined}
            onPressDisplay={controls.startEditing}
            onConfirm={confirmEditing}
            onCancel={controls.cancelEditing}
            onDelete={controls.removeOverlay}
            exiting={stickerExiting}
            onExitComplete={completeStickerExit}
          />
        ) : null}
      </View>
      {renderChrome({ textButton, isEditing: controls.isEditing })}
    </>
  );
}
