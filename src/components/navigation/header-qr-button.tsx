import { Platform, StyleSheet } from 'react-native';
import { Button, Host, Image as SwiftImage } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  buttonStyle,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useAppTheme } from '../../hooks/useAppTheme';
import { tap } from '../../lib/haptics';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { AppIcon } from '../ui/app-icon';
import { PressableScale } from '../ui/pressable-scale';

function openMyQrCode() {
  tap('light');
  router.push('/(tabs)/profile/my-code');
}

export function HeaderQrButton() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const label = t('profile.myQrCode');

  if (Platform.OS === 'ios') {
    return (
      <Host matchContents style={styles.host}>
        <Button
          onPress={openMyQrCode}
          modifiers={[
            buttonStyle('plain'),
            frame({ width: 36, height: 36 }),
            swiftAccessibilityLabel(label),
          ]}>
          <SwiftImage
            systemName={resolveAppIconName('qrcode') as SFSymbol}
            size={APP_ICON_SIZE.xl}
            color={colors.accent}
          />
        </Button>
      </Host>
    );
  }

  return (
    <PressableScale
      onPress={openMyQrCode}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={10}
      style={styles.androidPressable}>
      <AppIcon name="qrcode" size={APP_ICON_SIZE.xl} color={colors.accent} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  host: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  androidPressable: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
