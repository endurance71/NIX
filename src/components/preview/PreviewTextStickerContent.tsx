import { StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  DEFAULT_MEDIA_TEXT_COLOR,
  MEDIA_TEXT_CAPTION_BAR_LINE_HEIGHT_FACTOR,
} from '../../types/mediaTextOverlay';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { PreviewTextBar } from './PreviewTextBar';
import { PreviewTextVariantPicker } from './PreviewTextVariantPicker';
import type { PreviewTextStickerProps } from './PreviewTextSticker.types';
import { placeholderColorForText } from './previewTextPlaceholder';
import {
  BAR_TEXT_HORIZONTAL_PADDING,
  usePreviewTextStickerController,
} from './usePreviewTextStickerController';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type PreviewTextStickerContentProps = Pick<
  Required<PreviewTextStickerProps>,
  | 'text'
  | 'fontSize'
  | 'textColor'
  | 'barColor'
  | 'bold'
  | 'onChangeText'
  | 'onConfirm'
  | 'onDelete'
> &
  Pick<PreviewTextStickerProps, 'style' | 'onBarHeightChange' | 'onChangeVariant'> & {
    variant: NonNullable<PreviewTextStickerProps['variant']>;
    exiting: boolean;
    controller: ReturnType<typeof usePreviewTextStickerController>;
  };

function StickerTextInput({
  text,
  fontSize,
  textColor,
  bold,
  onChangeText,
  onConfirm,
  exiting,
  controller,
}: Pick<
  PreviewTextStickerContentProps,
  | 'text'
  | 'fontSize'
  | 'textColor'
  | 'bold'
  | 'onChangeText'
  | 'onConfirm'
  | 'exiting'
  | 'controller'
>) {
  const {
    inputRef,
    inputTextStyle,
    emptyCaretPaddingLeft,
    textAlign,
    textStyleExtras,
    emptyEditing,
    isEditing,
    placeholderText,
  } = controller;
  const fontWeight = bold ? '700' : '400';
  return (
    <AnimatedTextInput
      ref={inputRef}
      value={text}
      onChangeText={onChangeText}
      onFocus={controller.handleInputFocus}
      placeholder=""
      // The sticker is media content: its size comes from the size slider and is baked into the
      // file in points, so Dynamic Type must not scale it on screen.
      allowFontScaling={false}
      style={[
        styles.input,
        styles.inputLayer,
        inputTextStyle,
        emptyCaretPaddingLeft != null
          ? {
              paddingLeft: emptyCaretPaddingLeft,
              paddingRight: BAR_TEXT_HORIZONTAL_PADDING,
            }
          : null,
        {
          color: textColor,
          fontSize,
          fontWeight,
          textAlign: emptyEditing ? 'left' : textAlign,
          ...textStyleExtras,
        },
      ]}
      editable={isEditing && !controller.sheetPresented}
      pointerEvents={isEditing && !controller.sheetPresented && !exiting ? 'auto' : 'none'}
      multiline
      maxLength={200}
      textAlign={textAlign}
      returnKeyType="done"
      blurOnSubmit
      onSubmitEditing={onConfirm}
      accessibilityLabel={placeholderText}
      showSoftInputOnFocus={isEditing && !controller.sheetPresented && !exiting}
    />
  );
}

/** Edit-mode row above the caption: format (sticker only), bar / sticker switch, delete. */
function StickerActionsRow({
  variant,
  onChangeVariant,
  onDelete,
  exiting,
  controller,
}: Pick<
  PreviewTextStickerContentProps,
  'variant' | 'onChangeVariant' | 'onDelete' | 'exiting' | 'controller'
>) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { actionsStyle, isEditing, openFormatSheet } = controller;
  const isBar = variant === 'bar';
  return (
    <Animated.View
      style={[styles.actionsRow, isBar ? styles.actionsRowBar : null, actionsStyle]}
      pointerEvents={isEditing && !exiting ? 'auto' : 'none'}>
      <View style={styles.actionSlot}>
        {/* The bar has a fixed look: no format sheet. The slot stays so the switch is centred. */}
        {!isBar ? (
          <NativeChromeIconButton
            name="textFormat"
            accessibilityLabel={t('preview.textFormat')}
            onPress={openFormatSheet}
            backgroundColor={colors.cameraControlBackground}
            tintColor={colors.cameraControlTint}
            chromeVariant="glass"
          />
        ) : null}
      </View>
      <View pointerEvents={onChangeVariant ? 'box-none' : 'none'} style={styles.actionsSpacer}>
        {onChangeVariant ? (
          <PreviewTextVariantPicker
            variant={variant}
            onChangeVariant={onChangeVariant}
            backgroundColor={colors.cameraControlBackground}
          />
        ) : null}
      </View>
      <View style={styles.actionSlot}>
        <NativeChromeIconButton
          name="trash"
          accessibilityLabel={t('preview.deleteText')}
          onPress={onDelete}
          backgroundColor={colors.cameraControlBackground}
          tintColor={colors.destructive}
          chromeVariant="glass"
        />
      </View>
    </Animated.View>
  );
}

export function PreviewTextStickerContent({
  text,
  fontSize,
  textColor,
  barColor,
  bold,
  onChangeText,
  onConfirm,
  onDelete,
  exiting,
  style,
  onBarHeightChange,
  variant,
  onChangeVariant,
  controller,
}: PreviewTextStickerContentProps) {
  const fontWeight = bold ? '700' : '400';
  // The caption bar spans the media edge to edge (like the bake); the sticker keeps 90%.
  const isBar = variant === 'bar';
  const {
    composed,
    contentPresenceStyle,
    displayTextStyle,
    emptyEditing,
    isEditing,
    minimumBarHeight,
    placeholderText,
    setBarInnerWidth,
    setPlaceholderWidth,
    shellStyle,
    textAlign,
    textStyleExtras,
  } = controller;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[styles.shell, isBar ? styles.shellBar : null, shellStyle, style]}
        pointerEvents="box-none"
        accessibilityRole={!isEditing ? 'button' : undefined}
        accessibilityLabel={!isEditing ? text : undefined}>
        <View
          style={[
            styles.stickerWidth,
            isBar ? styles.stripWidth : null,
            { minHeight: minimumBarHeight },
          ]}
          onLayout={(event) => onBarHeightChange?.(event.nativeEvent.layout.height)}>
          <StickerActionsRow
            variant={variant}
            onChangeVariant={onChangeVariant}
            onDelete={onDelete}
            exiting={exiting}
            controller={controller}
          />

          <PreviewTextBar
            style={[styles.barWidth, { minHeight: minimumBarHeight }]}
            barColor={barColor}
            variant={variant}
            contentInsetH={BAR_TEXT_HORIZONTAL_PADDING}>
            <View
              style={[
                styles.barInner,
                // The bar's empty line matches the bake's one-line minimum.
                { minHeight: fontSize * (isBar ? MEDIA_TEXT_CAPTION_BAR_LINE_HEIGHT_FACTOR : 1.25) },
              ]}
              onLayout={(event) => setBarInnerWidth(event.nativeEvent.layout.width)}>
              <Animated.View style={[styles.barContentLayer, contentPresenceStyle]}>
                {emptyEditing ? (
                  <Text
                    pointerEvents="none"
                    allowFontScaling={false}
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
                    allowFontScaling={false}
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
                  allowFontScaling={false}
                  style={[
                    styles.displayText,
                    {
                      fontSize,
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
                <StickerTextInput
                  text={text}
                  fontSize={fontSize}
                  textColor={textColor}
                  bold={bold}
                  onChangeText={onChangeText}
                  onConfirm={onConfirm}
                  exiting={exiting}
                  controller={controller}
                />
              </Animated.View>
            </View>
          </PreviewTextBar>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
    paddingHorizontal: 16,
  },
  shellBar: {
    paddingHorizontal: 0,
  },
  stickerWidth: {
    width: '90%',
    alignSelf: 'center',
    position: 'relative',
  },
  stripWidth: {
    width: '100%',
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
  actionsRowBar: {
    left: 16,
    right: 16,
  },
  actionsSpacer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSlot: {
    width: 48,
    height: 48,
  },
  barInner: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: BAR_TEXT_HORIZONTAL_PADDING,
  },
  barContentLayer: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fakePlaceholder: {
    ...StyleSheet.absoluteFill,
    fontWeight: '700',
    textAlignVertical: 'center',
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
    textAlignVertical: 'center',
  },
  input: {
    fontWeight: '700',
    padding: 0,
    margin: 0,
    textAlignVertical: 'center',
  },
  inputLayer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
