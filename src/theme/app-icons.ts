import { Icon } from '@expo/ui';
import type { SFSymbol } from 'sf-symbols-typescript';

export type AppIconName =
  | 'camera'
  | 'cameraRotate'
  | 'chevronRight'
  | 'checkCircle'
  | 'clock'
  | 'close'
  | 'flash'
  | 'flashOff'
  | 'inbox'
  | 'mic'
  | 'micOff'
  | 'personAdd'
  | 'photoLibrary'
  | 'send'
  | 'timer';

type AppIconSpec = {
  ios: SFSymbol;
  android: Promise<{ default: number }>;
};

const ICON_SPECS: Record<AppIconName, AppIconSpec> = {
  camera: {
    ios: 'camera.fill',
    android: import('@expo/material-symbols/photo_camera.xml'),
  },
  cameraRotate: {
    ios: 'camera.rotate.fill',
    android: import('@expo/material-symbols/flip_camera_ios.xml'),
  },
  chevronRight: {
    ios: 'chevron.right',
    android: import('@expo/material-symbols/chevron_right.xml'),
  },
  checkCircle: {
    ios: 'checkmark.circle.fill',
    android: import('@expo/material-symbols/check_circle.xml'),
  },
  clock: {
    ios: 'clock.fill',
    android: import('@expo/material-symbols/schedule.xml'),
  },
  close: {
    ios: 'xmark',
    android: import('@expo/material-symbols/close.xml'),
  },
  flash: {
    ios: 'bolt.fill',
    android: import('@expo/material-symbols/flash_on.xml'),
  },
  flashOff: {
    ios: 'bolt.slash.fill',
    android: import('@expo/material-symbols/flash_off.xml'),
  },
  inbox: {
    ios: 'tray.fill',
    android: import('@expo/material-symbols/inbox.xml'),
  },
  mic: {
    ios: 'mic.fill',
    android: import('@expo/material-symbols/mic.xml'),
  },
  micOff: {
    ios: 'mic.slash.fill',
    android: import('@expo/material-symbols/mic_off.xml'),
  },
  personAdd: {
    ios: 'person.badge.plus',
    android: import('@expo/material-symbols/person_add.xml'),
  },
  photoLibrary: {
    ios: 'photo.on.rectangle.angled',
    android: import('@expo/material-symbols/photo_library.xml'),
  },
  send: {
    ios: 'paperplane.fill',
    android: import('@expo/material-symbols/send.xml'),
  },
  timer: {
    ios: 'timer',
    android: import('@expo/material-symbols/timer.xml'),
  },
};

export function resolveAppIconName(name: AppIconName) {
  const spec = ICON_SPECS[name];
  return Icon.select({ ios: spec.ios, android: spec.android });
}
