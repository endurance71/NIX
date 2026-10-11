import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Host } from '@expo/ui';
import { Slider, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityValue,
  font,
  foregroundStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import {
  DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE,
  MAX_MEDIA_TEXT_OVERLAY_FONT_SIZE,
  MIN_MEDIA_TEXT_OVERLAY_FONT_SIZE,
} from '../../types/mediaTextOverlay';

export const MIN_MEDIA_TEXT_FONT_SIZE = MIN_MEDIA_TEXT_OVERLAY_FONT_SIZE;
export const MAX_MEDIA_TEXT_FONT_SIZE = MAX_MEDIA_TEXT_OVERLAY_FONT_SIZE;
export const DEFAULT_MEDIA_TEXT_FONT_SIZE = DEFAULT_MEDIA_TEXT_OVERLAY_FONT_SIZE;

const CONTROL_RADIUS = 18;

type PreviewTextSizeSliderProps = {
  fontSize: number;
  onChangeFontSize: (fontSize: number) => void;
  accentColor: string;
  capsuleColor: string;
  labelColor: string;
};

/**
 * Native SwiftUI slider (step 1). JS only hears about whole-point changes, so the sticker
 * re-renders once per point instead of on every frame of the drag; VoiceOver gets the system
 * adjustable control with the size in points as its value.
 */
export function PreviewTextSizeSlider({
  fontSize,
  onChangeFontSize,
  accentColor,
  capsuleColor,
  labelColor,
}: PreviewTextSizeSliderProps) {
  const { t } = useTranslation();

  const handleValueChange = (value: number) => {
    const next = Math.round(
      Math.min(MAX_MEDIA_TEXT_FONT_SIZE, Math.max(MIN_MEDIA_TEXT_FONT_SIZE, value)),
    );
    if (next !== fontSize) onChangeFontSize(next);
  };

  return (
    <View style={[styles.container, { backgroundColor: capsuleColor }]}>
      <Host style={styles.host}>
        <Slider
          value={fontSize}
          min={MIN_MEDIA_TEXT_FONT_SIZE}
          max={MAX_MEDIA_TEXT_FONT_SIZE}
          step={1}
          onValueChange={handleValueChange}
          label={<SwiftText>{t('preview.textSize')}</SwiftText>}
          minimumValueLabel={
            <SwiftText
              modifiers={[
                font({ design: 'rounded', size: 14, weight: 'semibold' }),
                foregroundStyle(labelColor),
                accessibilityHidden(true),
              ]}>
              A
            </SwiftText>
          }
          maximumValueLabel={
            <SwiftText
              modifiers={[
                font({ design: 'rounded', size: 22, weight: 'bold' }),
                foregroundStyle(labelColor),
                accessibilityHidden(true),
              ]}>
              A
            </SwiftText>
          }
          modifiers={[
            tint(accentColor),
            accessibilityValue(t('preview.textSizeValue', { size: fontSize })),
          ]}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: CONTROL_RADIUS,
    borderCurve: 'continuous',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  host: {
    flex: 1,
    height: 52,
  },
});
