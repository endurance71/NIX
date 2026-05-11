import { Pressable, Text, View, type ViewStyle, type TextStyle } from 'react-native';

export type CameraPermissionStyles = {
  permissionContainer: ViewStyle;
  permissionText: TextStyle;
  permissionHint?: TextStyle;
  permissionButton: ViewStyle;
  permissionButtonText: TextStyle;
};

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
    <View style={styles.permissionContainer}>
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
    </View>
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
    <View style={styles.permissionContainer}>
      <Text style={styles.permissionText}>NiX potrzebuje dostępu do kamery, aby uchwycić momenty.</Text>
      <Pressable style={styles.permissionButton} onPress={onRequestPermission}>
        <Text style={styles.permissionButtonText}>Udziel dostępu</Text>
      </Pressable>
    </View>
  );
}
