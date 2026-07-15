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
  children: ReactNode;
  testID?: string;
  /** Override auto-measured `{ height }` detent (e.g. scrollable half/full sheets). */
  snapPoints?: SnapPoint[];
  showDragIndicator?: boolean;
};

export function AppBottomSheet({
  isPresented,
  onDismiss,
  children,
  testID,
  snapPoints,
  showDragIndicator = true,
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
