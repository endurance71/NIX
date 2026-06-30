import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  AUTH_BRAND_FRAME_SIZE,
  AUTH_BRAND_ICON_SIZE,
  AUTH_BRAND_RADIUS,
} from '../../theme/authLayout';
import { authRnTextStyle } from '../../theme/authTypography';

const logoLight = require('../../../assets/brand/app/ios-light.png');
const logoDark = require('../../../assets/brand/app/ios-dark.png');

type AuthBrandBlockProps = {
  size?: 'normal' | 'large';
};

/**
 * Brand block (logo + tagline) rendered as pure React Native.
 * Must only be used inside a pure-RN context (e.g. the `header` slot of
 * `AuthFormLayout`) — NOT inside any `@expo/ui` FieldGroup section or
 * SectionHeader/SectionFooter, as RNHostView inside native SwiftUI sections
 * causes layout overlap on iOS.
 */
export function AuthBrandBlock({ size = 'normal' }: AuthBrandBlockProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const logo = isDark ? logoDark : logoLight;

  const isLarge = size === 'large';
  const frameSize = isLarge ? 150 : AUTH_BRAND_FRAME_SIZE;
  const iconSize = isLarge ? 120 : AUTH_BRAND_ICON_SIZE;
  const borderRadius = isLarge ? 34 : AUTH_BRAND_RADIUS;

  return (
    <View style={[styles.wrap, isLarge && styles.wrapLarge]}>
      <View
        style={[
          styles.iconFrame,
          {
            backgroundColor: colors.secondarySystemBackground,
            borderColor: colors.separator,
            width: frameSize,
            height: frameSize,
            borderRadius: borderRadius,
          },
        ]}>
        <Image
          key={isDark ? 'nix-logo-dark' : 'nix-logo-light'}
          source={logo}
          style={{ width: iconSize, height: iconSize }}
          contentFit="contain"
          accessibilityLabel="NiX"
        />
      </View>
      <Text style={[styles.tagline, authRnTextStyle('tagline', colors), isLarge && styles.taglineLarge]}>
        {t('auth.tagline')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    width: '100%',
  },
  wrapLarge: {
    paddingTop: 32,
    paddingBottom: 16,
  },
  iconFrame: {
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tagline: {
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 300,
    paddingHorizontal: 12,
  },
  taglineLarge: {
    marginTop: 16,
    fontSize: 16,
    lineHeight: 22,
  },
});
