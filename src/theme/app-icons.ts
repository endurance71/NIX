import type { SFSymbol } from 'sf-symbols-typescript';

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

const APP_ICONS: Record<AppIconName, SFSymbol> = {
  camera: 'camera.fill',
  cameraRotate: 'camera.rotate.fill',
  chevronRight: 'chevron.right',
  checkCircle: 'checkmark.circle.fill',
  clock: 'clock.fill',
  close: 'xmark',
  email: 'envelope',
  flash: 'bolt.fill',
  flashOff: 'bolt.slash.fill',
  inbox: 'tray.fill',
  lock: 'lock',
  mic: 'mic.fill',
  micOff: 'mic.slash.fill',
  personAdd: 'person.badge.plus',
  profile: 'person.crop.circle.fill',
  photoLibrary: 'photo.on.rectangle.angled',
  send: 'paperplane.fill',
  timer: 'timer',
};

export function resolveAppIconName(name: AppIconName): SFSymbol {
  return APP_ICONS[name];
}
