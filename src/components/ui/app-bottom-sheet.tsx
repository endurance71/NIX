import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, RNHostView, type SnapPoint } from '@expo/ui';

/**
 * Universal fallback for hosting React Native content in `@expo/ui` BottomSheet.
 * The iOS implementation follows the dedicated SwiftUI pattern in
 * `app-bottom-sheet.ios.tsx`.
 */
type AppBottomSheetProps = {
  isPresented: boolean;
  onDismiss: () => void;
  onIsPresentedChange?: (isPresented: boolean) => void;
  children: ReactNode;
  testID?: string;
  /** Override auto-measured `{ height }` detent (e.g. scrollable half/full sheets). */
  snapPoints?: SnapPoint[];
  showDragIndicator?: boolean;
  backgroundInteraction?: 'automatic' | 'enabled' | 'disabled';
  disableInteractiveDismiss?: boolean;
};

// Metro resolves this fallback on non-iOS platforms; deslop only follows the
// iOS variant selected from the extensionless import.
// react-doctor-disable-next-line deslop/unused-export
export function AppBottomSheet({
  isPresented,
  onDismiss,
  onIsPresentedChange: _onIsPresentedChange,
  children,
  testID,
  snapPoints,
  showDragIndicator = true,
  backgroundInteraction: _backgroundInteraction,
  disableInteractiveDismiss: _disableInteractiveDismiss,
}: AppBottomSheetProps) {
  const hasSnapPoints = Boolean(snapPoints?.length);

  const hostedContent = (
    <View style={hasSnapPoints ? styles.flexContent : styles.compactContent}>{children}</View>
  ) as ReactElement;

  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      snapPoints={snapPoints}
      showDragIndicator={showDragIndicator}
      testID={testID}
    >
      <RNHostView matchContents={!hasSnapPoints}>{hostedContent}</RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  compactContent: {
    alignSelf: 'stretch',
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: 'transparent',
  },
  flexContent: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
});
