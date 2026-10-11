import { Alert, Linking } from 'react-native';
import i18n from './i18n';

/** What the denied permission was needed for; selects the explanatory message. */
export type PermissionAlertReason = 'avatarLibrary' | 'avatarCamera' | 'saveToPhotos';

const MESSAGE_KEYS: Record<PermissionAlertReason, string> = {
  avatarLibrary: 'profile.photoPermissionMessage',
  avatarCamera: 'profile.cameraPermissionMessage',
  saveToPhotos: 'media.savePermissionBlockedMessage',
};

/**
 * NOTIF-17: one system alert for every denied permission ("Brak dostępu" → Anuluj / Otwórz
 * Ustawienia). A denied permission needs a decision, so it is an alert, not a toast; on iOS the
 * system prompt cannot be shown again, so Settings is the only way forward.
 */
export function showPermissionDeniedAlert(reason: PermissionAlertReason): void {
  Alert.alert(i18n.t('permissions.deniedTitle'), i18n.t(MESSAGE_KEYS[reason]), [
    { text: i18n.t('common.cancel'), style: 'cancel' },
    {
      text: i18n.t('permissions.openSettings'),
      onPress: () => {
        void Linking.openSettings().catch((error: unknown) => {
          console.warn('openSettings failed', error);
        });
      },
    },
  ]);
}
