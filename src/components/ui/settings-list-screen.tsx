import { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FieldGroup } from '@expo/ui';
import { frame, refreshable } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from './app-host';

type SettingsListScreenProps = PropsWithChildren<{
  loading?: boolean;
  onRefresh?: () => Promise<void>;
}>;

export function SettingsListScreen({ children, loading, onRefresh }: SettingsListScreenProps) {
  const { colors, statusBarStyle } = useAppTheme();

  if (loading) {
    return (
      <AppHost style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <StatusBar style={statusBarStyle} />
        <ActivityIndicator color={colors.label} />
      </AppHost>
    );
  }

  return (
    <AppHost style={[styles.container, { backgroundColor: colors.background }]} useViewportSizeMeasurement>
      <StatusBar style={statusBarStyle} />
      <FieldGroup
        style={{ backgroundColor: colors.background }}
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          ...(onRefresh ? [refreshable(onRefresh)] : []),
        ]}>
        {children}
      </FieldGroup>
    </AppHost>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
