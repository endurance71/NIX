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

// The opaque app icon reads on both appearances; the dark/tinted variants are only the mark on
// a transparent background (iOS supplies their backdrop).
const logo = require('../../../assets/brand/app/ios-light.png');

/** App icon for the login hero. */
export function AuthBrandMark() {
  const logoUri = Asset.fromModule(logo).uri;

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
