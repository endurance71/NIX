import { PropsWithChildren } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Host, type UniversalHostProps } from '@expo/ui';
import type { Alignment } from '@expo/ui/swift-ui';
import { useAppTheme } from '../../hooks/useAppTheme';

export type AppHostSafeAreaMode = 'respect' | 'fullBleed' | 'keyboardOnly';

type AppHostProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  /** `{ vertical: true }` sizes the height to the content and keeps the width from RN layout. */
  matchContents?: boolean | { vertical?: boolean; horizontal?: boolean };
  /** @deprecated Prefer `safeAreaMode`. */
  ignoreSafeArea?: 'all' | 'keyboard';
  safeAreaMode?: AppHostSafeAreaMode;
  useViewportSizeMeasurement?: boolean;
  /**
   * Where the SwiftUI content sits when the host is larger than it. Defaults to `'center'`: SDK 57
   * centered it and every NiX screen was laid out that way; SDK 58 top-aligns by default.
   */
  alignment?: Alignment;
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
  alignment = 'center',
}: AppHostProps) {
  const { colorScheme } = useAppTheme();
  // On iOS the universal Host is the SwiftUI one, which takes `alignment`; the universal props
  // type does not list it yet.
  const alignmentProps = { alignment } as Partial<UniversalHostProps>;

  return (
    <Host
      style={style ?? { flex: 1 }}
      matchContents={matchContents}
      ignoreSafeArea={resolveIgnoreSafeArea(safeAreaMode, ignoreSafeArea)}
      useViewportSizeMeasurement={useViewportSizeMeasurement}
      colorScheme={colorScheme}
      {...alignmentProps}>
      {children}
    </Host>
  );
}
