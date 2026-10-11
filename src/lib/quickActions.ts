import type { RouterAction } from 'expo-quick-actions/router';

type Translate = (key: string) => string;

/**
 * Home Screen quick actions (long press on the app icon). Titles follow the app language;
 * hrefs are routes of this app.
 */
export function buildQuickActions(t: Translate): RouterAction[] {
  return [
    { id: 'new-nix', title: t('quickActions.newNix'), icon: 'symbol:camera.fill', params: { href: '/(tabs)' } },
    { id: 'inbox', title: t('quickActions.inbox'), icon: 'symbol:tray.fill', params: { href: '/(tabs)/inbox' } },
    { id: 'scan-qr', title: t('quickActions.scanQr'), icon: 'symbol:qrcode.viewfinder', params: { href: '/friend-scan-qr' } },
    { id: 'my-code', title: t('quickActions.myCode'), icon: 'symbol:qrcode', params: { href: '/(tabs)/profile/my-code' } },
  ];
}
