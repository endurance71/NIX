import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import type { ScreenInsetPolicy } from '../../theme/safeArea';

type NativeScreenProps = PropsWithChildren<{
  scroll?: boolean;
  insetPolicy?: ScreenInsetPolicy;
}>;

export function NativeScreen({ children, scroll = false, insetPolicy = 'stackHeader' }: NativeScreenProps) {
  const { colors } = useAppTheme();
  const { topContentInset, bottomContentInset } = useScreenInsets(insetPolicy);

  if (scroll) {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.systemBackground }]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 36 + bottomContentInset },
        ]}>
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.systemBackground,
          paddingTop: topContentInset,
          paddingBottom: bottomContentInset,
        },
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 14,
  },
});
