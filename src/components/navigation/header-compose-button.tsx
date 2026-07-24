import { Platform, Pressable, StyleSheet } from 'react-native';
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
import { resolveAppIconName } from '../../theme/app-icons';
import { AppIcon } from '../ui/app-icon';

function openComposeChat() {
  tap('light');
  router.push('/new-chat');
}

export function HeaderComposeButton() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const label = t('inbox.composeChatA11y');

  if (Platform.OS === 'ios') {
    return (
      <Host matchContents style={styles.host}>
        <Button
          onPress={openComposeChat}
          modifiers={[
            buttonStyle('plain'),
            frame({ width: 36, height: 36 }),
            swiftAccessibilityLabel(label),
          ]}>
          <SwiftImage
            systemName={resolveAppIconName('compose') as SFSymbol}
            size={22}
            color={colors.accent}
          />
        </Button>
      </Host>
    );
  }

  return (
    <Pressable
      onPress={openComposeChat}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={10}
      style={({ pressed }) => [styles.androidPressable, pressed && styles.pressed]}>
      <AppIcon name="compose" size={24} color={colors.accent} />
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
