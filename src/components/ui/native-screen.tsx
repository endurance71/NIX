import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import type { ScreenInsetPolicy } from '../../theme/safeArea';
import { spacing } from '../../theme/spacing';

const SCREEN_BOTTOM_PADDING = spacing.xxxl + spacing.xs;

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
          { paddingBottom: SCREEN_BOTTOM_PADDING + bottomContentInset },
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: SCREEN_BOTTOM_PADDING,
    gap: spacing.lg,
  },
});
