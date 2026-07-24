import { Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Button, HStack, Host, Image as SwiftImage, Menu, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  buttonStyle,
  foregroundStyle,
  frame,
  glassEffect,
  monospacedDigit,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { AppIcon } from './app-icon';
import { selection } from '../../lib/haptics';
import type { ThemeColors } from '../../theme/colors';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { typography } from '../../theme/typography';
import {
  NIX_VIEW_DURATION_CHOICES,
  formatNixViewDurationLabel,
  savePreferredNixViewDuration,
  shortNixViewDurationLabel,
  type NixViewDurationSec,
} from '../../lib/nixViewDuration';

import type { ChromeVariant } from './native-chrome-icon-button';

type PreviewDurationMenuProps = {
  selectedDurationSec: NixViewDurationSec;
  onSelect: (sec: NixViewDurationSec) => void;
  colors: ThemeColors;
  /** `solid` skips Liquid Glass to avoid iOS ambient dimming over fullscreen media. */
  chromeVariant?: ChromeVariant;
};

export default function PreviewDurationMenu({
  selectedDurationSec,
  onSelect,
  colors,
  chromeVariant = 'glass',
}: PreviewDurationMenuProps) {
  const choose = (sec: NixViewDurationSec) => {
    selection();
    onSelect(sec);
    void savePreferredNixViewDuration(sec);
  };

  if (Platform.OS !== 'ios') {
    return (
      <Pressable
        style={[styles.fallbackButton, { backgroundColor: colors.cameraControlBackground }]}
        onPress={() => {
          Alert.alert(
            'Czas wyświetlania',
            'Jak długo zdjęcie będzie widoczne u odbiorcy po otwarciu.',
            [
              ...NIX_VIEW_DURATION_CHOICES.map((sec) => ({
                text: `${formatNixViewDurationLabel(sec)}${sec === selectedDurationSec ? ' ✓' : ''}`,
                onPress: () => choose(sec),
              })),
              { text: 'Anuluj', style: 'cancel' as const },
            ],
            { cancelable: true }
          );
        }}
        hitSlop={10}
        accessibilityLabel={`Czas wyświetlania: ${formatNixViewDurationLabel(selectedDurationSec)}`}
        accessibilityRole="button">
        <AppIcon name="timer" size={APP_ICON_SIZE.lg} color={colors.cameraControlTint} />
        <Text style={[styles.fallbackLabel, { color: colors.cameraControlTint }]}>
          {shortNixViewDurationLabel(selectedDurationSec)}
        </Text>
      </Pressable>
    );
  }

  return (
    <Host matchContents>
      <Menu
        modifiers={[buttonStyle('plain')]}
        label={
          <HStack
            spacing={8}
            alignment="center"
            modifiers={[
              frame({ minWidth: 76, height: 48 }),
              padding({ leading: 14, trailing: 14 }),
              background(colors.cameraControlBackground, shapes.capsule()),
              ...(chromeVariant === 'glass'
                ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' as const })]
                : []),
              swiftAccessibilityLabel(`Czas wyświetlania: ${formatNixViewDurationLabel(selectedDurationSec)}`),
            ]}>
            <SwiftImage
              systemName={resolveAppIconName('timer') as SFSymbol}
              size={APP_ICON_SIZE.lg}
              color={colors.cameraControlTint}
            />
            <SwiftText modifiers={[foregroundStyle(colors.cameraControlTint), monospacedDigit()]}>
              {shortNixViewDurationLabel(selectedDurationSec)}
            </SwiftText>
          </HStack>
        }>
        {NIX_VIEW_DURATION_CHOICES.map((sec) => (
          <Button
            key={sec}
            label={formatNixViewDurationLabel(sec)}
            systemImage={sec === selectedDurationSec ? resolveAppIconName('checkmark') : undefined}
            onPress={() => choose(sec)}
          />
        ))}
      </Menu>
    </Host>
  );
}

const styles = StyleSheet.create({
  fallbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
  },
  fallbackLabel: {
    ...typography.footnote,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
