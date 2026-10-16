import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  resizable,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type InboxWidgetProps = {
  /** Unopened NiXes, the same number as the app icon badge. */
  count: number;
  locale: 'pl' | 'en';
};

// The widget runtime only sees this one function (no module helpers), so its branches stay here.
// oxlint-disable-next-line react-doctor/no-high-complexity-react-function
const InboxWidget = (props: InboxWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  // Widget layouts are serialized and evaluated inside the widget extension: keep every value
  // and helper in this function (module-level constants are not available there). Colours are
  // the brand tile from the app icon; strings are inlined for the same reason.
  const count = Math.max(0, Math.floor(props.count || 0));
  const shown = count > 99 ? '99+' : String(count);
  const pl = props.locale === 'pl';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const label = pl
    ? count === 0
      ? 'Brak nowych NiX-ów'
      : count === 1
        ? 'nowy NiX'
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? 'nowe NiX-y'
          : 'nowych NiX-ów'
    : count === 0
      ? 'No new NiXs'
      : count === 1
        ? 'new NiX'
        : 'new NiXs';
  const family = environment.widgetFamily;
  const url = widgetURL('nix://inbox');

  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={0} modifiers={[url, containerBackground({ type: 'material', material: 'ultraThin' }, 'widget')]}>
        <Text modifiers={[font({ size: 22, weight: 'bold', design: 'rounded' }), monospacedDigit()]}>
          {shown}
        </Text>
        <Text modifiers={[font({ design: 'rounded', size: 10, weight: 'semibold' })]}>NiX</Text>
      </VStack>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[url, containerBackground('#00000000', 'widget')]}>
        <Text modifiers={[font({ design: 'rounded', size: 13, weight: 'semibold' })]}>NiX</Text>
        <Text modifiers={[font({ size: 15, weight: 'bold', design: 'rounded' }), monospacedDigit()]}>
          {count === 0 ? label : `${shown} ${label}`}
        </Text>
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[
        url,
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
        containerBackground(
          {
            type: 'linearGradient',
            colors: ['#7F8CFF', '#4B4DF0', '#2A1A9E'],
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 1, y: 1 },
          },
          'widget'
        ),
      ]}>
      <HStack spacing={0}>
        <Image
          assetName="NixWidgetLogo"
          modifiers={[resizable(), frame({ width: 26, height: 26 }), clipShape('roundedRectangle', 7)]}
        />
        <Spacer />
      </HStack>
      <Spacer />
      <Text
        modifiers={[
          font({ size: count > 99 ? 38 : 46, weight: 'bold', design: 'rounded' }),
          monospacedDigit(),
          foregroundStyle('#FFFFFF'),
        ]}>
        {shown}
      </Text>
      <Text modifiers={[font({ design: 'rounded', size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFFD9')]}>
        {label}
      </Text>
    </VStack>
  );
};

export default createWidget<InboxWidgetProps>('NixInboxWidget', InboxWidget);
