import { Image as RNImage } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  aspectRatio,
  clipShape,
  font,
  foregroundStyle,
  frame,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AUTH_BRAND_ICON_SIZE, AUTH_FIELD_GROUP_CORNER_RADIUS } from '../../theme/authLayout';

const logoLight = require('../../../assets/brand/app/ios-light.png');

/** Login-only brand block: logo + footnote tagline. */
export function AuthBrandBlock() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const logoUri = RNImage.resolveAssetSource(logoLight).uri;

  return (
    <VStack alignment="center" spacing={8}>
      <Image
        uiImage={logoUri}
        modifiers={[
          resizable(),
          aspectRatio({ ratio: 1, contentMode: 'fill' }),
          frame({ width: AUTH_BRAND_ICON_SIZE, height: AUTH_BRAND_ICON_SIZE }),
          clipShape('roundedRectangle', AUTH_FIELD_GROUP_CORNER_RADIUS),
          accessibilityHidden(),
        ]}
      />
      <Text
        modifiers={[
          font({ textStyle: 'footnote' }),
          foregroundStyle(colors.secondaryLabel),
          frame({ maxWidth: 300, alignment: 'center' }),
        ]}>
        {t('auth.tagline')}
      </Text>
    </VStack>
  );
}
