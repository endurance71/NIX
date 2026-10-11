import type { ThemeColors } from '../../theme/colors';
import { radius } from '../../theme/radius';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type ButtonSize = 'regular' | 'large';

/** Uniform control heights: `large` for screen CTAs, `regular` (= 44 pt touch target) elsewhere. */
export const BUTTON_HEIGHT: Record<ButtonSize, number> = { regular: 44, large: 52 };

export const BUTTON_RADIUS = radius.button;

/** Dims a disabled button; a loading one stays at full strength so its spinner reads clearly. */
export const BUTTON_DISABLED_OPACITY = 0.45;

export type ButtonAppearance = {
  backgroundColor: string;
  foregroundColor: string;
};

type ButtonPalette = Pick<
  ThemeColors,
  | 'accent'
  | 'onAccent'
  | 'destructive'
  | 'onDestructive'
  | 'label'
  | 'secondarySystemFill'
>;

/**
 * Fill and ink for a `Button`. The black cinema surfaces (camera, preview, viewer) use native
 * SwiftUI glass actions instead (`NativeMediaActions`, `NativeChromeIconButton`).
 */
export function resolveButtonAppearance(
  variant: ButtonVariant,
  colors: ButtonPalette,
): ButtonAppearance {
  switch (variant) {
    case 'primary':
      return { backgroundColor: colors.accent, foregroundColor: colors.onAccent };
    case 'destructive':
      return { backgroundColor: colors.destructive, foregroundColor: colors.onDestructive };
    case 'secondary':
      return { backgroundColor: colors.secondarySystemFill, foregroundColor: colors.label };
    case 'tertiary':
      return { backgroundColor: 'transparent', foregroundColor: colors.accent };
  }
}

/** Whether the press handler may run: never while disabled or while an action is in flight. */
export function isButtonInteractive(disabled: boolean, loading: boolean): boolean {
  return !disabled && !loading;
}
