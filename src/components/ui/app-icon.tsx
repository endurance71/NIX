import { ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Host, Image } from '@expo/ui/swift-ui';
import { imageScale } from '@expo/ui/swift-ui/modifiers';
import { resolveAppIconName, type AppIconName } from '../../theme/app-icons';

type AppIconProps = {
  name: AppIconName;
  size: number;
  color?: ColorValue;
};

/** iOS: SwiftUI symbols must live under `Host`, including inside RN `Pressable` / `RNHostView`. */
export function AppIcon({ name, size, color }: AppIconProps) {
  const systemName = resolveAppIconName(name) as SFSymbol;

  return (
    <Host matchContents>
      <Image
        systemName={systemName}
        size={size}
        color={color}
        modifiers={[imageScale('small')]}
      />
    </Host>
  );
}
