import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  type MediaTextVariant,
} from '../../types/mediaTextOverlay';
import { PreviewTextFormatSheet } from './PreviewTextFormatSheet';
import { PreviewTrashTarget } from './PreviewTrashTarget';
import { PreviewTextStickerContent } from './PreviewTextStickerContent';
import type { PreviewTextStickerProps } from './PreviewTextSticker.types';
import { usePreviewTextStickerController } from './usePreviewTextStickerController';

export type { PreviewTextStickerMode } from './PreviewTextSticker.types';

export function PreviewTextSticker({
  mode,
  variant = 'sticker',
  onChangeVariant,
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
  barHeightPx,
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
  onBarHeightChange,
  style,
}: PreviewTextStickerProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const controller = usePreviewTextStickerController({
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
    barHeightPx,
    onTopPxChange,
    onPressDisplay,
    onConfirm,
    onDelete,
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

      {/* Drag target that appears while a placed sticker is dragged; VoiceOver users delete via
          the trash button in edit mode. */}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.trashZone, { top: controller.trashZoneTopPx }]}>
        <PreviewTrashTarget
          visible={controller.trashVisible}
          active={controller.trashActive}
          colors={colors}
        />
      </Animated.View>

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
        onBarHeightChange={onBarHeightChange}
        variant={variant}
        onChangeVariant={
          onChangeVariant
            ? (next: MediaTextVariant) => {
                // The bar has no format options; never leave its sheet open behind it.
                if (next === 'bar') controller.closeFormatSheet();
                onChangeVariant(next);
              }
            : undefined
        }
        controller={controller}
      />

      {onChangeStyle && variant === 'sticker' ? (
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
  trashZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 21,
  },
});
