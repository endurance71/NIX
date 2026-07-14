import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import {
  presentationDetents,
  presentationDragIndicator,
  type PresentationDetent,
} from '@expo/ui/swift-ui/modifiers';
import type { SnapPoint } from '@expo/ui';

type AppBottomSheetProps = {
  isPresented: boolean;
  onDismiss: () => void;
  children: ReactNode;
  testID?: string;
  snapPoints?: SnapPoint[];
  showDragIndicator?: boolean;
};

function snapPointToDetent(snapPoint: SnapPoint): PresentationDetent {
  if (snapPoint === 'half') return 'medium';
  if (snapPoint === 'full') return 'large';
  return snapPoint;
}

/**
 * iOS: swift-ui BottomSheet with RNHostView matchContents.
 * Avoid universal BottomSheet here — its Group adds `frame(maxWidth: Infinity)`, which makes
 * fitToContents measure the fallback `.medium` detent (~50% screen) instead of RN content height.
 */
export function AppBottomSheet({
  isPresented,
  onDismiss,
  children,
  testID,
  snapPoints,
  showDragIndicator = true,
}: AppBottomSheetProps) {
  const hasSnapPoints = Boolean(snapPoints?.length);

  const groupModifiers = [
    presentationDragIndicator(showDragIndicator ? 'visible' : 'hidden'),
    ...(hasSnapPoints ? [presentationDetents(snapPoints!.map(snapPointToDetent))] : []),
  ];

  const hostedContent = (
    <View style={hasSnapPoints ? styles.flexContent : styles.matchContent}>{children}</View>
  ) as ReactElement;

  return (
    <Host style={{ position: 'absolute' }} pointerEvents="none">
      <BottomSheet
        isPresented={isPresented}
        onIsPresentedChange={(presented) => {
          if (!presented) onDismiss();
        }}
        fitToContents={!hasSnapPoints}
        testID={testID}
      >
        <Group modifiers={groupModifiers}>
          {hasSnapPoints ? hostedContent : <RNHostView matchContents>{hostedContent}</RNHostView>}
        </Group>
      </BottomSheet>
    </Host>
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
