import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';

type NativeScreenProps = PropsWithChildren<{
  scroll?: boolean;
}>;

export function NativeScreen({ children, scroll = false }: NativeScreenProps) {
  const { colors } = useAppTheme();

  if (scroll) {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.systemBackground }]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[styles.screen, { backgroundColor: colors.systemBackground }]}>{children}</View>;
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
