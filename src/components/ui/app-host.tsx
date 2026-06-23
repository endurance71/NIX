import { PropsWithChildren } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Host } from '@expo/ui';
import { useAppTheme } from '../../hooks/useAppTheme';

type AppHostProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  matchContents?: boolean;
  ignoreSafeArea?: 'all' | 'keyboard';
  useViewportSizeMeasurement?: boolean;
}>;

export function AppHost({
  children,
  style,
  matchContents,
  ignoreSafeArea,
  useViewportSizeMeasurement = false,
}: AppHostProps) {
  const { statusBarStyle } = useAppTheme();

  return (
    <Host
      style={style ?? { flex: 1 }}
      matchContents={matchContents}
      ignoreSafeArea={ignoreSafeArea}
      useViewportSizeMeasurement={useViewportSizeMeasurement}
      colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      {children}
    </Host>
  );
}
