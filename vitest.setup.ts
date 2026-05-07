import { vi } from 'vitest';

/** Domyślne wartości na czas testów (ładowanie modułu supabase wymaga EXPO_PUBLIC_*). */
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://placeholder.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'placeholder-anon-key';
/** Gate haptyki i innych zachowań specyficznych dla iOS w kodzie produkcyjnym. */
process.env.EXPO_OS ??= 'ios';

/** mediaService importuje moduły Expo z natywnym core — w Node zastępujemy je stubami. */
vi.mock('expo-video', () => ({
  createVideoPlayer: vi.fn(() => ({
    replaceAsync: vi.fn().mockResolvedValue(undefined),
    generateThumbnailsAsync: vi.fn().mockResolvedValue([]),
    release: vi.fn(),
  })),
}));

vi.mock('expo-audio', () => ({
  setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('expo-image-manipulator', () => {
  const saveResult = { uri: 'file:///tmp/vitest-thumb.jpg', width: 240, height: 240 };
  const imageRef = {
    saveAsync: vi.fn().mockResolvedValue(saveResult),
    release: vi.fn(),
  };
  const context = {
    resize: vi.fn().mockReturnThis(),
    renderAsync: vi.fn().mockResolvedValue(imageRef),
    release: vi.fn(),
  };
  return {
    ImageManipulator: {
      manipulate: vi.fn().mockReturnValue(context),
    },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    manipulateAsync: vi.fn(),
  };
});
