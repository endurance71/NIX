import type { ComponentProps } from 'react';
import { Icon } from '@expo/ui';

type IconName = ComponentProps<typeof Icon>['name'];

export type AppIconName =
  | 'camera'
  | 'cameraRotate'
  | 'chevronRight'
  | 'checkCircle'
  | 'clock'
  | 'close'
  | 'email'
  | 'flash'
  | 'flashOff'
  | 'inbox'
  | 'lock'
  | 'mic'
  | 'micOff'
  | 'personAdd'
  | 'profile'
  | 'photoLibrary'
  | 'send'
  | 'timer';

const APP_ICONS: Record<AppIconName, IconName> = {
  camera: Icon.select({
    ios: 'camera.fill',
    android: import('@expo/material-symbols/photo_camera.xml'),
  }),
  cameraRotate: Icon.select({
    ios: 'camera.rotate.fill',
    android: import('@expo/material-symbols/flip_camera_ios.xml'),
  }),
  chevronRight: Icon.select({
    ios: 'chevron.right',
    android: import('@expo/material-symbols/chevron_right.xml'),
  }),
  checkCircle: Icon.select({
    ios: 'checkmark.circle.fill',
    android: import('@expo/material-symbols/check_circle.xml'),
  }),
  clock: Icon.select({
    ios: 'clock.fill',
    android: import('@expo/material-symbols/schedule.xml'),
  }),
  close: Icon.select({
    ios: 'xmark',
    android: import('@expo/material-symbols/close.xml'),
  }),
  email: Icon.select({
    ios: 'envelope',
    android: import('@expo/material-symbols/mail.xml'),
  }),
  flash: Icon.select({
    ios: 'bolt.fill',
    android: import('@expo/material-symbols/flash_on.xml'),
  }),
  flashOff: Icon.select({
    ios: 'bolt.slash.fill',
    android: import('@expo/material-symbols/flash_off.xml'),
  }),
  inbox: Icon.select({
    ios: 'tray.fill',
    android: import('@expo/material-symbols/inbox.xml'),
  }),
  lock: Icon.select({
    ios: 'lock',
    android: import('@expo/material-symbols/lock.xml'),
  }),
  mic: Icon.select({
    ios: 'mic.fill',
    android: import('@expo/material-symbols/mic.xml'),
  }),
  micOff: Icon.select({
    ios: 'mic.slash.fill',
    android: import('@expo/material-symbols/mic_off.xml'),
  }),
  personAdd: Icon.select({
    ios: 'person.badge.plus',
    android: import('@expo/material-symbols/person_add.xml'),
  }),
  profile: Icon.select({
    ios: 'person.crop.circle.fill',
    android: import('@expo/material-symbols/account_circle.xml'),
  }),
  photoLibrary: Icon.select({
    ios: 'photo.on.rectangle.angled',
    android: import('@expo/material-symbols/photo_library.xml'),
  }),
  send: Icon.select({
    ios: 'paperplane.fill',
    android: import('@expo/material-symbols/send.xml'),
  }),
  timer: Icon.select({
    ios: 'timer',
    android: import('@expo/material-symbols/timer.xml'),
  }),
};

export function resolveAppIconName(name: AppIconName): IconName {
  return APP_ICONS[name];
}
