import { type ReactNode } from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

export type CameraPermissionStyles = {
  permissionContainer: ViewStyle;
  permissionText: TextStyle;
  permissionHint?: TextStyle;
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
          <Button title={t('camera.goToInbox')} onPress={onNavigateInbox} size="large" />
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
      {/* App Review 5.1.1(iv): before the prompt the button only says "Continue"; after a
          refusal Settings is an optional, low-key link, never the main action. */}
      <Button
        title={t(canAskAgain ? 'camera.grantPermission' : 'camera.openSettings')}
        onPress={onRequestPermission}
        variant={canAskAgain ? 'primary' : 'tertiary'}
        size={canAskAgain ? 'large' : 'regular'}
      />
    </PermissionShell>
  );
}
