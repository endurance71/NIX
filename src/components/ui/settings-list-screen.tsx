import { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FieldGroup } from '@expo/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from './app-host';
import { useScreenInsets } from '../../hooks/useScreenInsets';

type SettingsListScreenProps = PropsWithChildren<{
  onRefresh?: () => Promise<void>;
  loading?: boolean;
}>;

export function SettingsListScreen({ children, onRefresh, loading }: SettingsListScreenProps) {
  const { colors, statusBarStyle } = useAppTheme();
  const { topContentInset, bottomContentInset } = useScreenInsets('tabStackList');

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
      <FieldGroup
        style={{
          paddingTop: topContentInset,
          paddingBottom: bottomContentInset,
        }}
        onAppear={() => {
          void onRefresh?.();
        }}>
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
