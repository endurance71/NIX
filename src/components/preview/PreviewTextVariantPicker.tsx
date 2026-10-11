import { Host } from '@expo/ui';
import { Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  fixedSize,
  glassEffect,
  padding,
  pickerStyle,
  shapes,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { useTranslation } from 'react-i18next';
import { selection } from '../../lib/haptics';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import type { MediaTextVariant } from '../../types/mediaTextOverlay';

const OUTER_PADDING = 4;

type PreviewTextVariantPickerProps = {
  variant: MediaTextVariant;
  onChangeVariant: (variant: MediaTextVariant) => void;
  /** Capsule fill below iOS 26, where `glassEffect` draws nothing. */
  backgroundColor: string;
};

function isMediaTextVariant(value: unknown): value is MediaTextVariant {
  return value === 'bar' || value === 'sticker';
}

/**
 * Native segmented control (SwiftUI `Picker`) on a Liquid Glass capsule that switches the edited
 * text between the Snapchat caption bar and the formatted sticker. Dark scheme: it sits on media.
 */
export function PreviewTextVariantPicker({
  variant,
  onChangeVariant,
  backgroundColor,
}: PreviewTextVariantPickerProps) {
  const { t } = useTranslation();
  const useGlass = canUseLiquidGlass();
  return (
    <Host matchContents colorScheme="dark" ignoreSafeArea="all">
      <Picker<MediaTextVariant>
        selection={variant}
        onSelectionChange={(next) => {
          if (!isMediaTextVariant(next) || next === variant) return;
          selection();
          onChangeVariant(next);
        }}
        modifiers={[
          pickerStyle('segmented'),
          fixedSize(),
          swiftAccessibilityLabel(t('preview.textVariant')),
          padding({ all: OUTER_PADDING }),
          ...(useGlass
            ? [glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' as const })]
            : [background(backgroundColor, shapes.capsule())]),
        ]}>
        <SwiftText modifiers={[tag('bar')]}>{t('preview.textVariantBar')}</SwiftText>
        <SwiftText modifiers={[tag('sticker')]}>{t('preview.textVariantSticker')}</SwiftText>
      </Picker>
    </Host>
  );
}
