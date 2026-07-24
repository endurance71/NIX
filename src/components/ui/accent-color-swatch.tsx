import { Image as SwiftImage } from '@expo/ui/swift-ui';

const DEFAULT_SIZE = 20;

type AccentColorSwatchProps = {
  color: string;
  size?: number;
};

/** SwiftUI circle — avoids RN View stretch inside ListItem / RNHostView. */
export function AccentColorSwatch({ color, size = DEFAULT_SIZE }: AccentColorSwatchProps) {
  return <SwiftImage systemName="circle.fill" size={size} color={color} />;
}
