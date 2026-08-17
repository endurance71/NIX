import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
} from '../../types/mediaTextOverlay';
import { PreviewTextFormatSheet } from './PreviewTextFormatSheet';
import { PreviewTextStickerContent } from './PreviewTextStickerContent';
import type { PreviewTextStickerProps } from './PreviewTextSticker.types';
import { usePreviewTextStickerController } from './usePreviewTextStickerController';

export type { PreviewTextStickerMode } from './PreviewTextSticker.types';

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
  const controller = usePreviewTextStickerController({
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
  });

  return (
    <>
      {controller.isEditing ? (
        <Pressable
          style={styles.editBackdrop}
          accessibilityRole="button"
          accessibilityLabel={
            controller.sheetPresented ? t('common.cancel') : t('preview.textDone')
          }
          onPress={controller.handleBackdropPress}
        />
      ) : null}

      <PreviewTextStickerContent
        text={text}
        fontSize={fontSize}
        textColor={textColor}
        barColor={barColor}
        bold={bold}
        onChangeText={onChangeText}
        onConfirm={onConfirm}
        onDelete={onDelete}
        exiting={exiting}
        style={style}
        controller={controller}
      />

      {onChangeStyle ? (
        <PreviewTextFormatSheet
          isPresented={controller.sheetPresented}
          onDismiss={controller.closeFormatSheet}
          style={controller.formatStyle}
          fontSize={fontSize}
          onChangeStyle={onChangeStyle}
          onContentHeightChange={controller.handleFormatSheetHeightChange}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  editBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 15,
  },
});
