import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  resolveMediaTextBarColor,
} from '../../types/mediaTextOverlay';

type PreviewTextBarProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  barColor?: string;
};

/** Static translucent caption bar shared visually with the exported media. */
export function PreviewTextBar({
  children,
  style,
  barColor = DEFAULT_MEDIA_TEXT_BAR_COLOR,
}: PreviewTextBarProps) {
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: resolveMediaTextBarColor(barColor) },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
