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

/**
 * SF Symbol in an RN tree (Pressable, lists outside SwiftUI Host).
 *
 * Render rules for NiX icons (all names from `app-icons.ts`):
 * 1. RN tree → `AppIcon`
 * 2. Inside SwiftUI `Host` / `Button` → `SwiftImage` + `resolveAppIconName` (avoid nested Host)
 * 3. When `weight` / SymbolView tint is required → `SymbolView` + `resolveAppIconName`
 * 4. NativeTabs / Stack.Toolbar → `sf` / `icon` string from `resolveAppIconName`
 */
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
