import { Host } from '@expo/ui';
import { Button, Text as SwiftText, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as swiftAccessibilityLabel,
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { canUseLiquidGlass } from '../../lib/liquidGlass';

/** Wide enough for „Spróbuj ponownie” at large Dynamic Type; height comes from `controlSize`. */
const ACTION_MIN_WIDTH = 160;

export type NativeMediaAction = {
  key: string;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
};

/**
 * Text actions on the black cinema surfaces (Retry / Skip / Back under a viewer or preview error):
 * native SwiftUI glass buttons (`controlSize('large')`, ≥ 44 pt) instead of hand-styled RN pills.
 * Below iOS 26 the system `bordered` style stands in for glass.
 */
export function NativeMediaActions({
  actions,
  tintColor,
}: {
  actions: NativeMediaAction[];
  tintColor: string;
}) {
  const style = canUseLiquidGlass() ? 'glass' : 'bordered';
  return (
    <Host matchContents colorScheme="dark">
      <VStack spacing={10}>
        {actions.map((action) => (
          <Button
            key={action.key}
            onPress={action.onPress}
            modifiers={[
              buttonStyle(style),
              controlSize('large'),
              swiftAccessibilityLabel(action.accessibilityLabel),
            ]}>
            <SwiftText
              modifiers={[
                font({ textStyle: 'callout', weight: 'semibold' }),
                foregroundStyle(tintColor),
                frame({ minWidth: ACTION_MIN_WIDTH }),
              ]}>
              {action.label}
            </SwiftText>
          </Button>
        ))}
      </VStack>
    </Host>
  );
}
