import { type ReactNode } from 'react';
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useScreenInsets } from '../../hooks/useScreenInsets';

export type CameraPermissionStyles = {
  permissionContainer: ViewStyle;
  permissionText: TextStyle;
  permissionHint?: TextStyle;
  permissionButton: ViewStyle;
  permissionButtonText: TextStyle;
};

function PermissionShell({
  styles,
  children,
}: {
  styles: CameraPermissionStyles;
  children: ReactNode;
}) {
  const { topContentInset, bottomContentInset } = useScreenInsets('fullscreen');

  return (
    <View
      style={[
        styles.permissionContainer,
        { paddingTop: topContentInset, paddingBottom: bottomContentInset },
      ]}>
      {children}
    </View>
  );
}

export function CameraInitializingPlaceholder({
  timedOut,
  onNavigateInbox,
  styles,
}: {
  timedOut: boolean;
  onNavigateInbox: () => void;
  styles: CameraPermissionStyles;
}) {
  return (
    <PermissionShell styles={styles}>
      <Text style={styles.permissionText}>Inicjalizacja kamery…</Text>
      {timedOut ? (
        <>
          <Text style={styles.permissionHint}>
            Kamera nie odpowiedziała. Spróbuj ponownie albo przejdź do Skrzynki.
          </Text>
          <Pressable style={styles.permissionButton} onPress={onNavigateInbox}>
            <Text style={styles.permissionButtonText}>Przejdź do Skrzynki</Text>
          </Pressable>
        </>
      ) : null}
    </PermissionShell>
  );
}

export function CameraPermissionDeniedPlaceholder({
  onRequestPermission,
  styles,
}: {
  onRequestPermission: () => void;
  styles: CameraPermissionStyles;
}) {
  return (
    <PermissionShell styles={styles}>
      <Text style={styles.permissionText}>NiX potrzebuje dostępu do kamery, aby uchwycić momenty.</Text>
      <Pressable style={styles.permissionButton} onPress={onRequestPermission}>
        <Text style={styles.permissionButtonText}>Udziel dostępu</Text>
      </Pressable>
    </PermissionShell>
  );
}
