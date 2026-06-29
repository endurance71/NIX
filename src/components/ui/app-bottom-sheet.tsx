import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { BottomSheet } from '@expo/ui';
import type { SnapPoint } from '@expo/ui';

const SHEET_HORIZONTAL_MARGIN = 32;

type AppBottomSheetProps = {
  isPresented: boolean;
  onDismiss: () => void;
  children: ReactNode;
  testID?: string;
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
  const { width } = useWindowDimensions();
  const contentWidth = Math.max(0, width - SHEET_HORIZONTAL_MARGIN);

  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      snapPoints={snapPoints}
      showDragIndicator={showDragIndicator}
      testID={testID}
    >
      <View style={[styles.content, { width: contentWidth }]}>{children}</View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'stretch',
  },
});
