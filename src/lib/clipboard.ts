import { requireOptionalNativeModule } from 'expo';

/**
 * `expo-clipboard` is a native module: a binary built before it was added has no `ExpoClipboard`,
 * and importing the package there would throw at load time. Check first, then load lazily, so an
 * older build simply hides „Kopiuj” instead of crashing the chat.
 */
export function isClipboardAvailable(): boolean {
  try {
    return requireOptionalNativeModule('ExpoClipboard') != null;
  } catch {
    return false;
  }
}

/** Resolves `false` when the clipboard is unavailable or the write failed. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || !isClipboardAvailable()) return false;
  try {
    const Clipboard = await import('expo-clipboard');
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}
