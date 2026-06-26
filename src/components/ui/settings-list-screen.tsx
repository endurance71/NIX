import { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FieldGroup } from '@expo/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from './app-host';
import { useScreenInsets } from '../../hooks/useScreenInsets';

type SettingsListScreenProps = PropsWithChildren<{
  loading?: boolean;
}>;

export function SettingsListScreen({ children, loading }: SettingsListScreenProps) {
  const { colors, statusBarStyle } = useAppTheme();
  const { bottomContentInset } = useScreenInsets('tabStackList');

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
        style={{
          backgroundColor: colors.background,
          paddingBottom: bottomContentInset,
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
