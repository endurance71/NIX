export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  overlay: string;
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  systemBackground: string;
  secondarySystemBackground: string;
  tertiarySystemBackground: string;
  /** Tło wierszy FieldGroup / ustawień (jak pola w Profilu). */
  secondarySystemGroupedBackground: string;
  separator: string;
  opaqueSeparator: string;
  systemFill: string;
  secondarySystemFill: string;
  systemBlue: string;
  destructive: string;
  cameraControlBackground: string;
  cameraControlTint: string;
  viewerChromeFill: string;
};

export const darkColors: ThemeColors = {
  background: '#000000',
  surface: '#FFFFFF12', // 7% white for base surface
  surfaceAlt: '#FFFFFF1A', // 10% white for elevated surfaces
  textPrimary: '#FFFFFF',
  textSecondary: '#EBEBF599', // Apple's standard secondary label
  textMuted: '#EBEBF54D', // Apple's standard tertiary label
  border: '#FFFFFF1A',
  borderStrong: '#FFFFFF33',
  accent: '#0A84FF', // Vibrant Apple Blue
  success: '#32D74B', // Vibrant Apple Green
  warning: '#FFD60A', // Vibrant Apple Yellow
  error: '#FF453A', // Vibrant Apple Red
  info: '#64D2FF',
  buttonPrimaryBg: '#FFFFFF',
  buttonPrimaryText: '#000000',
  buttonSecondaryBg: '#FFFFFF26', // 15% white
  buttonSecondaryText: '#FFFFFF',
  overlay: '#00000066', // 40% black
  label: '#FFFFFF',
  secondaryLabel: '#EBEBF599',
  tertiaryLabel: '#EBEBF54D',
  systemBackground: '#000000',
  secondarySystemBackground: '#1C1C1E',
  tertiarySystemBackground: '#2C2C2E',
  secondarySystemGroupedBackground: '#1C1C1E',
  separator: '#54545899',
  opaqueSeparator: '#38383A',
  systemFill: '#7878805C',
  secondarySystemFill: '#78788052',
  systemBlue: '#0A84FF',
  destructive: '#FF453A',
  cameraControlBackground: '#00000059',
  cameraControlTint: '#FFFFFF',
  viewerChromeFill: '#FFFFFF17',
};

export const lightColors: ThemeColors = {
  background: '#F2F2F7',
  surface: '#FFFFFFB3', // 70% white for translucent effect over light bg
  surfaceAlt: '#0000000D', // 5% black for alternative surface
  textPrimary: '#000000',
  textSecondary: '#3C3C4399', // Apple's standard secondary label
  textMuted: '#3C3C434D', // Apple's standard tertiary label
  border: '#3C3C432E',
  borderStrong: '#3C3C434D',
  accent: '#007AFF',
  success: '#34C759',
  warning: '#FF9F0A',
  error: '#FF3B30',
  info: '#0A84FF',
  buttonPrimaryBg: '#000000',
  buttonPrimaryText: '#FFFFFF',
  buttonSecondaryBg: '#0000001A', // 10% black
  buttonSecondaryText: '#000000',
  overlay: '#FFFFFF59', // 35% white
  label: '#000000',
  secondaryLabel: '#3C3C4399',
  tertiaryLabel: '#3C3C434D',
  systemBackground: '#FFFFFF',
  secondarySystemBackground: '#F2F2F7',
  tertiarySystemBackground: '#FFFFFF',
  secondarySystemGroupedBackground: '#FFFFFF',
  separator: '#3C3C434A',
  opaqueSeparator: '#C6C6C8',
  systemFill: '#78788033',
  secondarySystemFill: '#78788029',
  systemBlue: '#007AFF',
  destructive: '#FF3B30',
  cameraControlBackground: '#00000059',
  cameraControlTint: '#FFFFFF',
  viewerChromeFill: '#FFFFFF26',
};
