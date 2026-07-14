import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, RNHostView } from '@expo/ui';
import type { SnapPoint } from '@expo/ui';

type AppBottomSheetProps = {
  isPresented: boolean;
  onDismiss: () => void;
  children: ReactNode;
  testID?: string;
  /**
   * Use snap points only for tall / scrollable sheets.
   * Compact sheets should omit this — @expo/ui BottomSheet auto-sizes via `fitToContents`
   * when RN content is hosted in `RNHostView matchContents` (see Expo swift-ui BottomSheet docs).
   */
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
    <View style={hasSnapPoints ? styles.flexContent : styles.matchContent}>{children}</View>
  ) as ReactElement;

  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      snapPoints={snapPoints}
      showDragIndicator={showDragIndicator}
      testID={testID}
    >
      {hasSnapPoints ? (
        hostedContent
      ) : (
        <RNHostView matchContents>{hostedContent}</RNHostView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  matchContent: {
    alignSelf: 'stretch',
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  flexContent: {
    alignSelf: 'stretch',
    width: '100%',
    flex: 1,
  },
});
