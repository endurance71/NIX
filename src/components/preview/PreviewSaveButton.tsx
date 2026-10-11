import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../theme/colors';
import { runWithFinally } from '../../lib/runWithFinally';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';

const SAVED_STATE_MS = 2000;
const BUTTON_SIZE = 48;

type SaveState = 'idle' | 'saving' | 'saved';

/** Save-to-Photos chrome button: spinner while baking/saving, a checkmark for a moment after. */
export function PreviewSaveButton({
  onSave,
  colors,
  disabled = false,
}: {
  onSave: () => Promise<boolean>;
  colors: ThemeColors;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<SaveState>('idle');
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    [],
  );

  const handlePress = () => {
    if (state !== 'idle' || disabled) return;
    setState('saving');
    let saved = false;
    void runWithFinally(
      async () => {
        saved = await onSave();
      },
      () => {
        if (!saved) {
          setState('idle');
          return;
        }
        setState('saved');
        savedTimerRef.current = setTimeout(() => setState('idle'), SAVED_STATE_MS);
      },
    ).catch(() => undefined);
  };

  if (state === 'saving') {
    return (
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('preview.saving')}
        accessibilityState={{ busy: true, disabled: true }}
        style={[styles.busy, { backgroundColor: colors.cameraControlBackground }]}>
        <ActivityIndicator color={colors.cameraControlTint} />
      </View>
    );
  }

  return (
    <NativeChromeIconButton
      name={state === 'saved' ? 'checkmark' : 'saveToPhotos'}
      accessibilityLabel={state === 'saved' ? t('preview.saved') : t('media.saveToGalleryA11y')}
      onPress={handlePress}
      disabled={disabled}
      backgroundColor={colors.cameraControlBackground}
      tintColor={colors.cameraControlTint}
      chromeVariant="glass"
    />
  );
}

const styles = StyleSheet.create({
  busy: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
