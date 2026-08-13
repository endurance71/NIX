import { StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { tap } from '../../lib/haptics';
import { DEFAULT_MEDIA_TEXT_COLOR } from '../../types/mediaTextOverlay';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { PreviewTextBar } from './PreviewTextBar';
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
  Pick<PreviewTextStickerProps, 'style'> & {
    exiting: boolean;
    controller: ReturnType<typeof usePreviewTextStickerController>;
  };

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
  controller,
}: PreviewTextStickerContentProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const fontWeight = bold ? '700' : '400';
  const {
    actionsStyle,
    composed,
    contentPresenceStyle,
    displayTextStyle,
    emptyCaretPaddingLeft,
    emptyEditing,
    inputRef,
    inputTextStyle,
    isEditing,
    minimumBarHeight,
    openFormatSheet,
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

          <PreviewTextBar
            style={[styles.barWidth, { minHeight: minimumBarHeight }]}
            barColor={barColor}>
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
                      ? {
                          paddingLeft: emptyCaretPaddingLeft,
                          paddingRight: BAR_TEXT_HORIZONTAL_PADDING,
                        }
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
                  editable={isEditing && !controller.sheetPresented}
                  pointerEvents={
                    isEditing && !controller.sheetPresented && !exiting ? 'auto' : 'none'
                  }
                  multiline
                  maxLength={200}
                  textAlign={textAlign}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={onConfirm}
                  accessibilityLabel={placeholderText}
                  showSoftInputOnFocus={
                    isEditing && !controller.sheetPresented && !exiting
                  }
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
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
    paddingHorizontal: 16,
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
