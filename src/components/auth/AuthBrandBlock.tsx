import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AuthRnBridge } from '../ui/auth-rn-bridge';
import {
  AUTH_BRAND_FRAME_SIZE,
  AUTH_BRAND_ICON_SIZE,
  AUTH_BRAND_RADIUS,
} from '../../theme/authLayout';
import { authRnTextStyle } from '../../theme/authTypography';

const logoLight = require('../../../assets/brand/app/ios-light.png');
const logoDark = require('../../../assets/brand/app/ios-dark.png');

export function AuthBrandBlock() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const logo = isDark ? logoDark : logoLight;

  return (
    <AuthRnBridge>
      <View style={styles.wrap}>
        <View
          style={[
            styles.iconFrame,
            {
              backgroundColor: colors.secondarySystemBackground,
              borderColor: colors.separator,
            },
          ]}>
          <Image
            key={isDark ? 'nix-logo-dark' : 'nix-logo-light'}
            source={logo}
            style={styles.icon}
            contentFit="contain"
            accessibilityLabel="NiX"
          />
        </View>
        <Text style={[styles.tagline, authRnTextStyle('tagline', colors)]}>{t('auth.tagline')}</Text>
      </View>
    </AuthRnBridge>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
  },
  iconFrame: {
    width: AUTH_BRAND_FRAME_SIZE,
    height: AUTH_BRAND_FRAME_SIZE,
    borderRadius: AUTH_BRAND_RADIUS,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  icon: {
    width: AUTH_BRAND_ICON_SIZE,
    height: AUTH_BRAND_ICON_SIZE,
  },
  tagline: {
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 300,
    paddingHorizontal: 12,
  },
});
