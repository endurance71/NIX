/**
 * Fasada haptyki zgodna z Apple HIG (Impact / Selection / Notification).
 * Tylko iOS — na innych platformach no-op.
 */
import * as Haptics from 'expo-haptics';

function isIOS(): boolean {
  return process.env.EXPO_OS === 'ios';
}

export type ImpactIntensity = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
export type NotifyKind = 'success' | 'warning' | 'error';

function toImpactStyle(intensity: ImpactIntensity): Haptics.ImpactFeedbackStyle {
  switch (intensity) {
    case 'light':
      return Haptics.ImpactFeedbackStyle.Light;
    case 'medium':
      return Haptics.ImpactFeedbackStyle.Medium;
    case 'heavy':
      return Haptics.ImpactFeedbackStyle.Heavy;
    case 'soft':
      return Haptics.ImpactFeedbackStyle.Soft;
    case 'rigid':
      return Haptics.ImpactFeedbackStyle.Rigid;
    default: {
      const _exhaustive: never = intensity;
      return _exhaustive;
    }
  }
}

function toNotifyType(kind: NotifyKind): Haptics.NotificationFeedbackType {
  switch (kind) {
    case 'success':
      return Haptics.NotificationFeedbackType.Success;
    case 'warning':
      return Haptics.NotificationFeedbackType.Warning;
    case 'error':
      return Haptics.NotificationFeedbackType.Error;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Impact — fizyczne „kliknięcie" UI (przycisk, start akcji). */
export function tap(intensity: ImpactIntensity = 'light'): void {
  if (!isIOS()) return;
  void Haptics.impactAsync(toImpactStyle(intensity)).catch(() => {});
}

/** Selection — ruch przez dyskretne wartości (toggle, picker). */
export function selection(): void {
  if (!isIOS()) return;
  void Haptics.selectionAsync().catch(() => {});
}

/** Notification — wynik zadania (sukces / ostrzeżenie / błąd). */
export function notify(kind: NotifyKind): void {
  if (!isIOS()) return;
  void Haptics.notificationAsync(toNotifyType(kind)).catch(() => {});
}
