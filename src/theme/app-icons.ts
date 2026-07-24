import type { SFSymbol } from 'sf-symbols-typescript';

export type AppIconName =
  | 'camera'
  | 'cameraRotate'
  | 'chevronRight'
  | 'checkCircle'
  | 'checkmark'
  | 'clock'
  | 'close'
  | 'email'
  | 'star'
  | 'flash'
  | 'flashOff'
  | 'document'
  | 'inbox'
  | 'notification'
  | 'lock'
  | 'mic'
  | 'micOff'
  | 'personAdd'
  | 'profile'
  | 'photoLibrary'
  | 'send'
  | 'compose'
  | 'more'
  | 'timer'
  | 'trash'
  | 'qrcode'
  | 'signOut'
  | 'shield'
  | 'key'
  | 'circle'
  | 'circleFill'
  | 'paintpalette'
  | 'report'
  | 'warning'
  | 'block'
  | 'folder'
  | 'undo';

/** Canonical point sizes for SF Symbols across AppIcon / SwiftImage / SymbolView. */
export const APP_ICON_SIZE = {
  xs: 13,
  sm: 16,
  md: 18,
  settings: 19,
  lg: 20,
  xl: 22,
  xxl: 24,
} as const;

export type AppIconSizeToken = keyof typeof APP_ICON_SIZE;

const APP_ICONS: Record<AppIconName, SFSymbol> = {
  camera: 'camera',
  cameraRotate: 'camera.rotate',
  chevronRight: 'chevron.right',
  checkCircle: 'checkmark.circle',
  checkmark: 'checkmark',
  clock: 'clock',
  close: 'xmark',
  email: 'envelope',
  star: 'star',
  flash: 'bolt',
  flashOff: 'bolt.slash',
  document: 'doc.text',
  inbox: 'tray',
  notification: 'bell',
  lock: 'lock',
  mic: 'mic',
  micOff: 'mic.slash',
  personAdd: 'person.badge.plus',
  profile: 'person.crop.circle',
  photoLibrary: 'photo.on.rectangle.angled',
  send: 'arrow.up',
  compose: 'square.and.pencil',
  more: 'ellipsis',
  timer: 'timer',
  trash: 'trash',
  qrcode: 'qrcode.viewfinder',
  signOut: 'rectangle.portrait.and.arrow.right',
  shield: 'shield',
  key: 'key',
  circle: 'circle',
  circleFill: 'circle.fill',
  paintpalette: 'paintpalette',
  report: 'exclamationmark.bubble',
  warning: 'exclamationmark.triangle',
  block: 'hand.raised',
  folder: 'folder',
  undo: 'arrow.uturn.backward',
};

export function resolveAppIconName(name: AppIconName): SFSymbol {
  return APP_ICONS[name];
}
