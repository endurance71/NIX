import { StyleSheet, View } from 'react-native';
import { Text } from '@expo/ui';
import { useAppTheme } from '../../hooks/useAppTheme';

export function SettingsSectionTitle({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sectionTitleWrap}>
      <Text textStyle={{ fontSize: 13, fontWeight: '600', color: colors.secondaryLabel }}>{children}</Text>
    </View>
  );
}

export function SettingsEmptyText({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return <Text textStyle={{ fontSize: 15, color: colors.secondaryLabel, lineHeight: 20 }}>{children}</Text>;
}

const styles = StyleSheet.create({
  sectionTitleWrap: {
    paddingTop: 20,
    paddingBottom: 6,
    paddingHorizontal: 20,
  },
});
