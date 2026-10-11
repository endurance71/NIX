import type { SFSymbol } from 'sf-symbols-typescript';

export type AppIconName =
  | 'camera'
  | 'cameraRotate'
  | 'cameraFill'
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
  | 'edit'
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
  | 'redo'
  | 'pencilTip'
  | 'chart'
  | 'devices'
  | 'download'
  | 'share'
  | 'friends'
  | 'privacySecurity'
  | 'textFormat'
  | 'filters'
  | 'emojiSticker'
  | 'bold'
  | 'textAlignLeft'
  | 'textAlignCenter'
  | 'textAlignRight'
  | 'retry'
  | 'offline'
  | 'pauseCircleFill'
  | 'checkCircleFill'
  | 'warningFill'
  | 'statusPhoto'
  | 'statusPhotoOpened'
  | 'statusVideo'
  | 'statusVideoOpened'
  | 'statusText'
  | 'statusTextOpened'
  | 'statusReplayed'
  | 'statusFailed'
  | 'pin'
  | 'unpin'
  | 'notificationOff'
  | 'markRead'
  | 'personRemove'
  | 'speakerOn'
  | 'speakerOff'
  | 'search'
  | 'playFill'
  | 'pauseFill'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'torchOn'
  | 'torchOff'
  | 'myQrCode'
  | 'copy'
  | 'chevronDown'
  // Memories album and passkey sign-in.
  | 'memories'
  | 'resend'
  | 'passkey'
  // Friend detail: streak and best-friend rows.
  | 'streak'
  | 'bestFriend'
  // Chat: saved messages and voice messages.
  | 'saveMessage'
  | 'unsaveMessage'
  | 'savedMessage'
  | 'micFill'
  // Voice composer: ends a recording for review.
  | 'stopFill'
  | 'chevronLeft'
  // Search fields: clears the query.
  | 'clearText'
  // Chat message menu: reply, forward, undo send.
  | 'reply'
  | 'forward'
  | 'unsend';

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
  // Viewer: reply to the sender with a NiX.
  cameraFill: 'camera.fill',
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
  edit: 'pencil',
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
  redo: 'arrow.uturn.forward',
  pencilTip: 'pencil.tip',
  chart: 'chart.bar',
  devices: 'iphone.gen3',
  download: 'arrow.down.doc',
  share: 'square.and.arrow.up',
  friends: 'person.2',
  privacySecurity: 'lock.shield',
  textFormat: 'textformat',
  filters: 'camera.filters',
  emojiSticker: 'face.smiling',
  bold: 'bold',
  textAlignLeft: 'text.alignleft',
  textAlignCenter: 'text.aligncenter',
  textAlignRight: 'text.alignright',
  retry: 'arrow.clockwise',
  offline: 'wifi.slash',
  pauseCircleFill: 'pause.circle.fill',
  checkCircleFill: 'checkmark.circle.fill',
  warningFill: 'exclamationmark.triangle.fill',
  // Message statuses: the symbol says what kind of message it is, filled until opened.
  statusPhoto: 'photo.fill',
  statusPhotoOpened: 'photo',
  statusVideo: 'video.fill',
  statusVideoOpened: 'video',
  statusText: 'bubble.left.fill',
  statusTextOpened: 'bubble.left',
  statusReplayed: 'arrow.counterclockwise',
  statusFailed: 'exclamationmark.circle.fill',
  // Inbox conversation actions (context menu / swipe) and friend detail.
  pin: 'pin',
  unpin: 'pin.slash',
  notificationOff: 'bell.slash',
  markRead: 'envelope.open',
  personRemove: 'person.badge.minus',
  speakerOn: 'speaker.wave.2.fill',
  speakerOff: 'speaker.slash.fill',
  search: 'magnifyingglass',
  playFill: 'play.fill',
  pauseFill: 'pause.fill',
  stopFill: 'stop.fill',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strikethrough',
  torchOn: 'flashlight.on.fill',
  torchOff: 'flashlight.off.fill',
  myQrCode: 'qrcode',
  // Chat: copy a message, scroll to the newest one.
  copy: 'doc.on.doc',
  chevronDown: 'chevron.down',
  // Memories: the private album of sent NiXes, and sending one again.
  memories: 'photo.stack',
  resend: 'arrowshape.turn.up.right',
  // Passkey sign-in on the login screen.
  passkey: 'person.badge.key',
  // Friend detail: streak (🔥) and best-friend (😊/💛) rows.
  streak: 'flame.fill',
  bestFriend: 'heart.fill',
  // Chat: „Zapisz w czacie” (save / unsave / saved marker) and voice messages.
  saveMessage: 'bookmark',
  unsaveMessage: 'bookmark.slash',
  savedMessage: 'bookmark.fill',
  micFill: 'mic.fill',
  chevronLeft: 'chevron.left',
  clearText: 'xmark.circle.fill',
  reply: 'arrowshape.turn.up.left',
  forward: 'arrowshape.turn.up.right',
  unsend: 'arrow.uturn.backward.circle',
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
