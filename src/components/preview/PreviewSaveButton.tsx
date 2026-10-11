import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../theme/colors';
import { runWithFinally } from '../../lib/runWithFinally';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';

const SAVED_STATE_MS = 2000;

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

  return (
    <NativeChromeIconButton
      name={state === 'saved' ? 'checkmark' : 'saveToPhotos'}
      accessibilityLabel={
        state === 'saving'
          ? t('preview.saving')
          : state === 'saved'
            ? t('preview.saved')
            : t('media.saveToGalleryA11y')
      }
      onPress={handlePress}
      busy={state === 'saving'}
      disabled={disabled}
      backgroundColor={colors.cameraControlBackground}
      tintColor={colors.cameraControlTint}
      chromeVariant="glass"
    />
  );
}

