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
  | 'message'
  | 'reaction'
  | 'lock'
  | 'mic'
  | 'micOff'
  | 'personAdd'
  | 'profile'
  | 'photoLibrary'
  | 'saveToPhotos'
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
  | 'undo'
  | 'chart'
  | 'devices'
  | 'download'
  | 'share'
  | 'friends'
  | 'privacySecurity';

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
  message: 'message',
  reaction: 'heart',
  lock: 'lock',
  mic: 'mic',
  micOff: 'mic.slash',
  personAdd: 'person.badge.plus',
  profile: 'person.crop.circle',
  photoLibrary: 'photo.on.rectangle.angled',
  saveToPhotos: 'square.and.arrow.down',
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
  chart: 'chart.bar',
  devices: 'iphone.gen3',
  download: 'arrow.down.doc',
  share: 'square.and.arrow.up',
  friends: 'person.2',
  privacySecurity: 'lock.shield',
};

export function resolveAppIconName(name: AppIconName): SFSymbol {
  return APP_ICONS[name];
}

type SettingsIconMetrics = {
  size: number;
  weight: 'regular';
};

const DEFAULT_SETTINGS_ICON_METRICS: SettingsIconMetrics = {
  size: 17.5,
  weight: 'regular',
};

/**
 * SF Symbols share a typographic point size, but their visible bounds differ.
 * These small corrections keep settings icons optically equal without stretching them.
 */
const SETTINGS_ICON_METRICS: Partial<Record<AppIconName, SettingsIconMetrics>> = {
  notification: { size: 17, weight: 'regular' },
  message: { size: 20, weight: 'regular' },
  reaction: { size: 17, weight: 'regular' },
  friends: { size: 22, weight: 'regular' },
};

export function resolveSettingsIconMetrics(name: AppIconName): SettingsIconMetrics {
  return SETTINGS_ICON_METRICS[name] ?? DEFAULT_SETTINGS_ICON_METRICS;
}
