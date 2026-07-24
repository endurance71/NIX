import type { SFSymbol } from 'sf-symbols-typescript';
import { Image as SwiftImage } from '@expo/ui/swift-ui';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';

type AccentColorSwatchProps = {
  color: string;
  size?: number;
};

/** SwiftUI circle — avoids RN View stretch inside ListItem / RNHostView. */
export function AccentColorSwatch({ color, size = APP_ICON_SIZE.lg }: AccentColorSwatchProps) {
  return (
    <SwiftImage
      systemName={resolveAppIconName('circleFill') as SFSymbol}
      size={size}
      color={color}
    />
  );
}
