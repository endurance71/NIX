import { type ReactNode } from 'react';
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  return (
    <PermissionShell styles={styles}>
      <Text style={styles.permissionText}>{t('camera.initializing')}</Text>
      {timedOut ? (
        <>
          <Text style={styles.permissionHint}>
            {t('camera.initializationTimeout')}
          </Text>
          <Pressable style={styles.permissionButton} onPress={onNavigateInbox} accessibilityRole="button">
            <Text style={styles.permissionButtonText}>{t('camera.goToInbox')}</Text>
          </Pressable>
        </>
      ) : null}
    </PermissionShell>
  );
}

export function CameraPermissionDeniedPlaceholder({
  onRequestPermission,
  canAskAgain,
  styles,
}: {
  onRequestPermission: () => void;
  canAskAgain: boolean;
  styles: CameraPermissionStyles;
}) {
  const { t } = useTranslation();
  return (
    <PermissionShell styles={styles}>
      <Text style={styles.permissionText}>{t(canAskAgain ? 'camera.permissionRequired' : 'camera.permissionBlocked')}</Text>
      <Pressable style={styles.permissionButton} onPress={onRequestPermission} accessibilityRole="button">
        <Text style={styles.permissionButtonText}>{t(canAskAgain ? 'camera.grantPermission' : 'camera.openSettings')}</Text>
      </Pressable>
    </PermissionShell>
  );
}
