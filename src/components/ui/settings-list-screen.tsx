import { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FieldGroup } from '@expo/ui';
import { frame, refreshable } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from './app-host';
import { OfflineStatusBanner } from '../auth/OfflineStatusBanner';

type SettingsListScreenProps = PropsWithChildren<{
  loading?: boolean;
  onRefresh?: () => Promise<void>;
}>;

export function SettingsListScreen({ children, loading, onRefresh }: SettingsListScreenProps) {
  const { colors, statusBarStyle } = useAppTheme();

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <OfflineStatusBanner />
        <AppHost style={[styles.container, styles.centered]}>
          <StatusBar style={statusBarStyle} />
          <ActivityIndicator color={colors.label} />
        </AppHost>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OfflineStatusBanner />
      <AppHost style={styles.container} useViewportSizeMeasurement>
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
    </View>
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
