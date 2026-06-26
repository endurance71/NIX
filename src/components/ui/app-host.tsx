import { PropsWithChildren } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Host } from '@expo/ui';
import { useAppTheme } from '../../hooks/useAppTheme';

export type AppHostSafeAreaMode = 'respect' | 'fullBleed' | 'keyboardOnly';

type AppHostProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  matchContents?: boolean;
  /** @deprecated Prefer `safeAreaMode`. */
  ignoreSafeArea?: 'all' | 'keyboard';
  safeAreaMode?: AppHostSafeAreaMode;
  useViewportSizeMeasurement?: boolean;
}>;

function resolveIgnoreSafeArea(
  safeAreaMode: AppHostSafeAreaMode | undefined,
  ignoreSafeArea: 'all' | 'keyboard' | undefined
): 'all' | 'keyboard' | undefined {
  if (safeAreaMode === 'fullBleed') return 'all';
  if (safeAreaMode === 'keyboardOnly') return 'keyboard';
  if (safeAreaMode === 'respect') return undefined;
  return ignoreSafeArea;
}

/**
 * Universal `@expo/ui` Host wrapper. `useViewportSizeMeasurement` shrinks layout bounds but does
 * not apply safe-area padding — use `useScreenInsets` on screen shells when content must avoid
 * system bars.
 */
export function AppHost({
  children,
  style,
  matchContents,
  ignoreSafeArea,
  safeAreaMode,
  useViewportSizeMeasurement = false,
}: AppHostProps) {
  const { colorScheme } = useAppTheme();

  return (
    <Host
      style={style ?? { flex: 1 }}
      matchContents={matchContents}
      ignoreSafeArea={resolveIgnoreSafeArea(safeAreaMode, ignoreSafeArea)}
      useViewportSizeMeasurement={useViewportSizeMeasurement}
      colorScheme={colorScheme}>
      {children}
    </Host>
  );
}
