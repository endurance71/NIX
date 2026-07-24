import { Platform, Pressable, StyleSheet } from 'react-native';
import { Button, Host, Image as SwiftImage } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  buttonStyle,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { tap } from '../../lib/haptics';
import { AppIcon } from '../ui/app-icon';

export function HeaderQrButton() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const label = t('profile.myQrCode');

  const handlePress = () => {
    tap('light');
    router.push('/friend-my-code');
  };

  if (Platform.OS === 'ios') {
    return (
      <Host matchContents style={styles.host}>
        <Button
          onPress={handlePress}
          modifiers={[
            buttonStyle('plain'),
            frame({ width: 36, height: 36 }),
            swiftAccessibilityLabel(label),
          ]}>
          <SwiftImage systemName="qrcode.viewfinder" size={22} color={colors.label} />
        </Button>
      </Host>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={10}
      style={({ pressed }) => [styles.androidPressable, pressed && styles.pressed]}>
      <AppIcon name="qrcode" size={24} color={colors.label} />
    </Pressable>
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
  pressed: {
    opacity: 0.6,
  },
});
