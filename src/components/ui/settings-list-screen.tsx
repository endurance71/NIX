import { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { List, Text } from '@expo/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from './app-host';

type SettingsListScreenProps = PropsWithChildren<{
  onRefresh?: () => Promise<void>;
  loading?: boolean;
}>;

export function SettingsListScreen({ children, onRefresh, loading }: SettingsListScreenProps) {
  const { colors, statusBarStyle } = useAppTheme();

  if (loading) {
    return (
      <AppHost style={[styles.container, styles.centered]}>
        <StatusBar style={statusBarStyle} />
        <ActivityIndicator color={colors.label} />
      </AppHost>
    );
  }

  return (
    <AppHost style={styles.container} useViewportSizeMeasurement>
      <StatusBar style={statusBarStyle} />
      <List onRefresh={onRefresh}>{children}</List>
    </AppHost>
  );
}

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
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitleWrap: {
    paddingTop: 20,
    paddingBottom: 6,
    paddingHorizontal: 20,
  },
});
