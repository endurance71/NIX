import { ColorValue } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { Host, Icon } from '@expo/ui/jetpack-compose';
import { resolveAppIconName, type AppIconName } from '../../theme/app-icons';

type AppIconProps = {
  name: AppIconName;
  size: number;
  color?: ColorValue;
};

/** Android: Compose `IconView` must be a direct child of `Host` (never bare universal `Icon` in RN trees). */
export function AppIcon({ name, size, color }: AppIconProps) {
  const source = resolveAppIconName(name) as ImageSourcePropType;

  return (
    <Host matchContents>
      <Icon source={source} size={size} tint={color} />
    </Host>
  );
}
