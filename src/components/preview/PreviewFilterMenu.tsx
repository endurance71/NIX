import { useTranslation } from 'react-i18next';
import { Button, Host, Image as SwiftImage, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  buttonStyle,
  frame,
  glassEffect,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { selection } from '../../lib/haptics';
import {
  MEDIA_FILTER_IDS,
  MEDIA_FILTER_LABEL_KEYS,
  type MediaFilterId,
} from '../../lib/mediaFilters';
import type { ThemeColors } from '../../theme/colors';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import type { ChromeVariant } from '../ui/native-chrome-icon-button';

const SIZE = 48;

type PreviewFilterMenuProps = {
  filter: MediaFilterId;
  onChangeFilter: (next: MediaFilterId) => void;
  colors: ThemeColors;
  chromeVariant?: ChromeVariant;
};

/** Toolbar button with a native menu of all filters — the tappable alternative to swiping. */
export function PreviewFilterMenu({
  filter,
  onChangeFilter,
  colors,
  chromeVariant = 'glass',
}: PreviewFilterMenuProps) {
  const { t } = useTranslation();
  const label = t('preview.filterMenuA11y', { name: t(MEDIA_FILTER_LABEL_KEYS[filter]) });
  return (
    <Host matchContents style={{ width: SIZE, height: SIZE }}>
      <Menu
        modifiers={[buttonStyle('plain')]}
        label={
          <SwiftImage
            systemName={resolveAppIconName('filters') as SFSymbol}
            size={APP_ICON_SIZE.xl}
            color={filter === 'original' ? colors.cameraControlTint : colors.accent}
            modifiers={[
              frame({ width: SIZE, height: SIZE }),
              background(colors.cameraControlBackground, shapes.circle()),
              ...(chromeVariant === 'glass'
                ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'circle' as const })]
                : []),
              swiftAccessibilityLabel(label),
            ]}
          />
        }>
        {MEDIA_FILTER_IDS.map((id) => (
          <Button
            key={id}
            label={t(MEDIA_FILTER_LABEL_KEYS[id])}
            systemImage={id === filter ? resolveAppIconName('checkmark') : undefined}
            onPress={() => {
              if (id === filter) return;
              selection();
              onChangeFilter(id);
            }}
          />
        ))}
      </Menu>
    </Host>
  );
}
