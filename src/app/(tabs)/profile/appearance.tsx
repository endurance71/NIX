import { View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RNHostView } from '@expo/ui';
import {
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { ACCENT_PRESETS, resolveAccentColor } from '../../../theme/accent-presets';

const SWATCH_SIZE = 22;

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const { accentPresetId, setAccentPresetId, colorScheme, colors } = useAppTheme();

  return (
    <>
      <SettingsListScreen>
        <NativeSettingsSection title={t('profile.accentColorSectionTitle')}>
          {ACCENT_PRESETS.map((preset) => {
            const swatchColor = resolveAccentColor(preset.id, colorScheme);
            const selected = preset.id === accentPresetId;
            return (
              <NativeSettingsRow
                key={preset.id}
                title={t(preset.labelKey)}
                leading={
                  <RNHostView matchContents>
                    <View
                      style={{
                        width: SWATCH_SIZE,
                        height: SWATCH_SIZE,
                        borderRadius: SWATCH_SIZE / 2,
                        backgroundColor: swatchColor,
                      }}
                    />
                  </RNHostView>
                }
                trailing={
                  selected ? (
                    <SymbolView
                      name="checkmark"
                      size={16}
                      tintColor={colors.accent}
                      fallback={<View style={{ width: 16, height: 16 }} />}
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
