import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import {
  presentationDetents,
  presentationDragIndicator,
  type ModifierConfig,
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
 * Native iOS BottomSheet following Expo's React Native content pattern:
 * `fitToContents` + `Group` + `RNHostView matchContents`.
 *
 * The presentation background is intentionally untouched so iOS can render
 * its system translucent material (Liquid Glass on iOS 26).
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
  const groupModifiers: ModifierConfig[] = [
    presentationDragIndicator(showDragIndicator ? 'visible' : 'hidden'),
  ];

  if (hasSnapPoints) {
    groupModifiers.push(presentationDetents(snapPoints!.map(snapPointToDetent)));
  }

  const hostedContent = (
    <View style={hasSnapPoints ? styles.flexContent : styles.compactContent}>{children}</View>
  ) as ReactElement;

  return (
    <Host style={styles.host} pointerEvents="none">
      <BottomSheet
        isPresented={isPresented}
        onIsPresentedChange={() => undefined}
        onDismiss={onDismiss}
        fitToContents={!hasSnapPoints}
        testID={testID}
      >
        <Group modifiers={groupModifiers}>
          <RNHostView matchContents={!hasSnapPoints}>{hostedContent}</RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
  },
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
