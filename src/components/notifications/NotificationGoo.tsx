import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Blur, Canvas, ColorMatrix, Group, Paint, RoundedRect, Shadow } from '@shopify/react-native-skia';
import { interpolateColor, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { buildNotificationGeometry } from './vendor/geometry';
import { buildGooMatrix } from './vendor/gooMatrix';
import type { INotificationLayout } from './vendor/layoutTypes';

type Props = {
  layout: INotificationLayout;
  drop: SharedValue<number>;
  expand: SharedValue<number>;
  tint: SharedValue<number>;
  dragY: SharedValue<number>;
  color: string;
  shadow: string;
};

/** Skia geometry/filter from the upstream example, with NiX colors and drag alignment. */
export const NotificationGoo = memo(function NotificationGoo({ layout, drop, expand, tint, dragY, color, shadow }: Props) {
  const geometry = useDerivedValue(() => buildNotificationGeometry({ drop: drop.value, expand: expand.value, layout }));
  const x = useDerivedValue(() => geometry.value.x);
  const y = useDerivedValue(() => geometry.value.y + dragY.value);
  const width = useDerivedValue(() => geometry.value.width);
  const height = useDerivedValue(() => geometry.value.height);
  const radius = useDerivedValue(() => geometry.value.radius);
  const neckX = useDerivedValue(() => geometry.value.neckX);
  const neckY = useDerivedValue(() => geometry.value.neckY);
  const neckWidth = useDerivedValue(() => geometry.value.neckWidth);
  const neckHeight = useDerivedValue(() => geometry.value.neckHeight);
  const neckRadius = useDerivedValue(() => geometry.value.neckRadius);
  const opacity = useDerivedValue(() => geometry.value.shadowOpacity);
  const droplet = useDerivedValue(() => interpolateColor(tint.value, [0.06, 0.88], ['#000000', color]), [color]);
  const matrix = useMemo(() => buildGooMatrix({ gain: 22, threshold: 0.43 }), []);
  const blur = 14.3;
  const inset = blur * 0.26;
  const islandX = layout.centerX - layout.islandWidth / 2;

  return (
    <Canvas pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { height: layout.canvasHeight }]}>
      <Group opacity={opacity}>
        <RoundedRect x={x} y={y} width={width} height={height} r={radius}>
          <Shadow dx={0} dy={5} blur={9} color={shadow} shadowOnly />
        </RoundedRect>
      </Group>
      <Group layer={<Paint><Blur blur={blur} /><ColorMatrix matrix={matrix} /></Paint>}>
        <RoundedRect x={islandX + inset} y={layout.islandTop + inset}
          width={layout.islandWidth - inset * 2} height={layout.islandHeight - inset * 2}
          r={layout.islandRadius - inset} color="#000000" />
        <RoundedRect x={neckX} y={neckY} width={neckWidth} height={neckHeight} r={neckRadius} color="#000000" />
        <RoundedRect x={x} y={y} width={width} height={height} r={radius} color={droplet} />
      </Group>
      <RoundedRect x={islandX} y={layout.islandTop} width={layout.islandWidth}
        height={layout.islandHeight} r={layout.islandRadius} color="#000000" />
    </Canvas>
  );
});
