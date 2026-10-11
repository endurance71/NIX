import { beforeEach, describe, expect, it, vi } from 'vitest';

import { showPermissionDeniedAlert } from './permissionAlert';

const { alert, openSettings } = vi.hoisted(() => ({
  alert: vi.fn(),
  openSettings: vi.fn(async () => undefined),
}));

vi.mock('react-native', () => ({ Alert: { alert }, Linking: { openSettings } }));
vi.mock('./i18n', () => ({ default: { t: (key: string) => key } }));

type AlertButton = { text: string; style?: string; onPress?: () => void };

describe('showPermissionDeniedAlert (NOTIF-17)', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['avatarLibrary', 'profile.photoPermissionMessage'],
    ['avatarCamera', 'profile.cameraPermissionMessage'],
    ['saveToPhotos', 'media.savePermissionBlockedMessage'],
  ] as const)('uses the shared title and buttons for %s', (reason, messageKey) => {
    showPermissionDeniedAlert(reason);

    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe('permissions.deniedTitle');
    expect(message).toBe(messageKey);
    expect(buttons.map((button) => [button.text, button.style])).toEqual([
      ['common.cancel', 'cancel'],
      ['permissions.openSettings', undefined],
    ]);
  });

  it('opens the app settings from the second button', () => {
    showPermissionDeniedAlert('avatarLibrary');
    const buttons = alert.mock.calls[0][2] as AlertButton[];

    buttons[1].onPress?.();

    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
