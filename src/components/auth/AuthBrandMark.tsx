import { Asset } from 'expo-asset';
import { Image, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  aspectRatio,
  clipShape,
  frame,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AUTH_LOGIN_LOGO_CORNER_RADIUS, AUTH_LOGIN_LOGO_SIZE } from '../../theme/authLayout';

const logoLight = require('../../../assets/brand/app/ios-light.png');
const logoDark = require('../../../assets/brand/app/ios-dark.png');

/** App icon for login hero — switches with system light/dark. */
export function AuthBrandMark() {
  const { isDark } = useAppTheme();
  const logoUri = Asset.fromModule(isDark ? logoDark : logoLight).uri;

  return (
    <VStack spacing={0} modifiers={[frame({ alignment: 'center' })]}>
      <Image
        uiImage={logoUri}
        modifiers={[
          resizable(),
          aspectRatio({ ratio: 1, contentMode: 'fill' }),
          frame({ width: AUTH_LOGIN_LOGO_SIZE, height: AUTH_LOGIN_LOGO_SIZE }),
          clipShape('roundedRectangle', AUTH_LOGIN_LOGO_CORNER_RADIUS),
          accessibilityHidden(),
        ]}
      />
    </VStack>
  );
}
