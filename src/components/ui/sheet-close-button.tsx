import { Button } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as swiftDisabled,
  labelStyle,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useTranslation } from 'react-i18next';
import { resolveAppIconName } from '../../theme/app-icons';
import { AppHost } from './app-host';

/** The system close button is 44 pt tall; the host is square so it lines up with a title. */
export const SHEET_CLOSE_BUTTON_SIZE = 44;

/**
 * The close button every NiX sheet uses: an xmark in a glass circle, like system sheets on
 * iOS 26. Outside a toolbar `role="close"` alone draws the word, so the xmark is explicit and
 * "Close" stays as the VoiceOver label. Needs a SwiftUI host above it; see `HostedSheetCloseButton`
 * for React Native layouts.
 */
export function SheetCloseButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <Button
      role="close"
      systemImage={resolveAppIconName('close') as SFSymbol}
      label={t('common.close')}
      onPress={onPress}
      modifiers={[
        labelStyle('iconOnly'),
        buttonStyle('glass'),
        buttonBorderShape('circle'),
        controlSize('large'),
        swiftDisabled(disabled),
      ]}
    />
  );
}

/** `SheetCloseButton` in its own host, for sheets laid out in React Native. */
export function HostedSheetCloseButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  return (
    <AppHost matchContents style={{ width: SHEET_CLOSE_BUTTON_SIZE, height: SHEET_CLOSE_BUTTON_SIZE }}>
      <SheetCloseButton onPress={onPress} disabled={disabled} />
    </AppHost>
  );
}
