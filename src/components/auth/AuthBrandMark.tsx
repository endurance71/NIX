import { Asset } from 'expo-asset';
import { Image, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  aspectRatio,
  clipShape,
  frame,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { AUTH_LOGIN_LOGO_CORNER_RADIUS, AUTH_LOGIN_LOGO_SIZE } from '../../theme/authLayout';

const logoHero = require('../../../assets/brand/app/ios-light.png');
const logoUri = Asset.fromModule(logoHero).uri;

/** App icon for login hero. ios-light in both modes until ios-dark hero crop is fixed. */
export function AuthBrandMark() {
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
