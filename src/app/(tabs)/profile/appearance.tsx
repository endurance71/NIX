import { View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Stack } from 'expo-router';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useTranslation } from 'react-i18next';
import { AccentAppearancePreview } from '../../../components/ui/accent-appearance-preview';
import { AccentColorSwatch } from '../../../components/ui/accent-color-swatch';
import {
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { ACCENT_PRESETS, resolveAccentColor } from '../../../theme/accent-presets';
import { APP_ICON_SIZE, resolveAppIconName } from '../../../theme/app-icons';

const SWATCH_SIZE = APP_ICON_SIZE.xl;

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const { accentPresetId, setAccentPresetId, colorScheme, colors } = useAppTheme();

  return (
    <>
      <SettingsListScreen>
        <NativeSettingsSection>
          <AccentAppearancePreview />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('profile.accentColorSectionTitle')}>
          {ACCENT_PRESETS.map((preset) => {
            const swatchColor = resolveAccentColor(preset.id, colorScheme);
            const selected = preset.id === accentPresetId;
            return (
              <NativeSettingsRow
                key={preset.id}
                title={t(preset.labelKey)}
                leading={<AccentColorSwatch color={swatchColor} size={SWATCH_SIZE} />}
                trailing={
                  selected ? (
                    <SymbolView
                      name={resolveAppIconName('checkmark') as SFSymbol}
                      size={APP_ICON_SIZE.sm}
                      tintColor={colors.accent}
                      fallback={<View style={{ width: APP_ICON_SIZE.sm, height: APP_ICON_SIZE.sm }} />}
                    />
                  ) : undefined
                }
                onPress={() => setAccentPresetId(preset.id)}
                testID={`appearance-accent-${preset.id}`}
              />
            );
          })}
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{t('profile.appearanceTitle')}</Stack.Screen.Title>
    </>
  );
}
