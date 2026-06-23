/**
 * Haptics facade aligned with Apple HIG (Impact / Selection / Notification).
 * Enabled on iOS and Android via expo-haptics.
 */
import * as Haptics from 'expo-haptics';

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

/** Impact — physical UI click (button, action start). */
export function tap(intensity: ImpactIntensity = 'light'): void {
  void Haptics.impactAsync(toImpactStyle(intensity)).catch(() => {});
}

/** Selection — moving through discrete values (toggle, picker). */
export function selection(): void {
  void Haptics.selectionAsync().catch(() => {});
}

/** Notification — task outcome (success / warning / error). */
export function notify(kind: NotifyKind): void {
  void Haptics.notificationAsync(toNotifyType(kind)).catch(() => {});
}
