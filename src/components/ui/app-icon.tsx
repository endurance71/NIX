import { ColorValue } from 'react-native';
import { Icon } from '@expo/ui';
import { resolveAppIconName, type AppIconName } from '../../theme/app-icons';

type AppIconProps = {
  name: AppIconName;
  size: number;
  color?: ColorValue;
};

export function AppIcon({ name, size, color }: AppIconProps) {
  return <Icon name={resolveAppIconName(name)} size={size} color={color} />;
}
