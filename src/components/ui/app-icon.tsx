import { ColorValue } from 'react-native';
import { Host, Icon } from '@expo/ui';
import { resolveAppIconName, type AppIconName } from '../../theme/app-icons';

type AppIconProps = {
  name: AppIconName;
  size: number;
  color?: ColorValue;
};

/** Web / fallback: keep Host wrapper for API parity with native platform files. */
export function AppIcon({ name, size, color }: AppIconProps) {
  return (
    <Host matchContents>
      <Icon name={resolveAppIconName(name)} size={size} color={color} />
    </Host>
  );
}
