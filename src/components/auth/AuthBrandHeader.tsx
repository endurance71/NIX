import { StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { typography } from '../../theme/typography';
import {
  AUTH_BRAND_BOTTOM_GAP,
  AUTH_BRAND_ICON_SIZE,
  AUTH_BRAND_TOP_PADDING,
} from '../../theme/authLayout';

const logoLight = require('../../../assets/brand/app/ios-light.png');
const logoDark = require('../../../assets/brand/app/ios-dark.png');

export function AuthBrandHeader() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const appIcon = isDark ? logoDark : logoLight;

  return (
    <Animated.View
      entering={FadeInDown.duration(800).springify()}
      style={styles.wrap}>
      <Image
        source={appIcon}
        style={styles.icon}
        accessibilityLabel="NiX Logo"
        contentFit="cover"
      />
      <Text style={[styles.title, { color: colors.textPrimary }]}>NiX</Text>
      <Text style={[styles.tagline, { color: colors.textSecondary }]}>
        {t('auth.tagline')}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: AUTH_BRAND_TOP_PADDING,
    paddingBottom: AUTH_BRAND_BOTTOM_GAP,
  },
  icon: {
    width: AUTH_BRAND_ICON_SIZE,
    height: AUTH_BRAND_ICON_SIZE,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  title: {
    ...typography.title2,
    marginTop: 12,
    fontWeight: '700',
  },
  tagline: {
    ...typography.footnote,
    marginTop: 4,
    textAlign: 'center',
    opacity: 0.8,
  },
});
