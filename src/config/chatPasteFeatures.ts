/**
 * Clipboard paste into chat. Off unless the internal TestFlight binary
 * (or a local .env) sets EXPO_PUBLIC_CHAT_PASTE_INPUT_ENABLED=true.
 * Not a secret — do not put credentials in EXPO_PUBLIC_*.
 */
export const chatPasteFeatures = {
  pasteInput: process.env.EXPO_PUBLIC_CHAT_PASTE_INPUT_ENABLED === 'true',
} as const;
