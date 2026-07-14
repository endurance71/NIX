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
  | 'document'
  | 'inbox'
  | 'lock'
  | 'mic'
  | 'micOff'
  | 'personAdd'
  | 'profile'
  | 'photoLibrary'
  | 'send'
  | 'timer'
  | 'trash'
  | 'qrcode'
  | 'personMinus'
  | 'signOut'
  | 'shield'
  | 'key'
  | 'circle';

const APP_ICONS: Record<AppIconName, SFSymbol> = {
  camera: 'camera',
  cameraRotate: 'camera.rotate',
  chevronRight: 'chevron.right',
  checkCircle: 'checkmark.circle',
  clock: 'clock',
  close: 'xmark',
  email: 'envelope',
  flash: 'bolt',
  flashOff: 'bolt.slash',
  document: 'doc.text',
  inbox: 'tray',
  lock: 'lock',
  mic: 'mic',
  micOff: 'mic.slash',
  personAdd: 'person.badge.plus',
  profile: 'person.crop.circle',
  photoLibrary: 'photo.on.rectangle.angled',
  send: 'paperplane',
  timer: 'timer',
  trash: 'trash',
  qrcode: 'qrcode.viewfinder',
  personMinus: 'person.badge.minus',
  signOut: 'rectangle.portrait.and.arrow.right',
  shield: 'shield',
  key: 'key',
  circle: 'circle',
};

export function resolveAppIconName(name: AppIconName): SFSymbol {
  return APP_ICONS[name];
}
