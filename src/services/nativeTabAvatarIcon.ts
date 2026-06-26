import type { ImageSourcePropType } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const TAB_AVATAR_ICON_DIR = `${FileSystem.cacheDirectory ?? ''}native-tab-avatars/`;
const TAB_AVATAR_ICON_PX = 56;
const TAB_AVATAR_ICON_POINTS = 28;

function safeCacheFileName(key: string) {
  return key.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 120);
}

export async function createNativeTabAvatarIconSource(
  avatarUrl: string,
  cacheKey: string
): Promise<ImageSourcePropType | null> {
  if (!FileSystem.cacheDirectory) return null;

  try {
    const baseName = safeCacheFileName(cacheKey);
    const downloadedUri = `${TAB_AVATAR_ICON_DIR}${baseName}.source`;
    const outputUri = `${TAB_AVATAR_ICON_DIR}${baseName}.png`;

    const [, outputInfo] = await Promise.all([
      FileSystem.makeDirectoryAsync(TAB_AVATAR_ICON_DIR, { intermediates: true }),
      FileSystem.getInfoAsync(outputUri),
    ]);
    if (outputInfo.exists) {
      return {
        uri: outputUri,
        width: TAB_AVATAR_ICON_POINTS,
        height: TAB_AVATAR_ICON_POINTS,
        scale: 2,
      };
    }

    await FileSystem.downloadAsync(avatarUrl, downloadedUri);
    const resized = await manipulateAsync(
      downloadedUri,
      [{ resize: { width: TAB_AVATAR_ICON_PX, height: TAB_AVATAR_ICON_PX } }],
      { compress: 1, format: SaveFormat.PNG }
    );

    await FileSystem.moveAsync({ from: resized.uri, to: outputUri });
    void FileSystem.deleteAsync(downloadedUri, { idempotent: true });

    return {
      uri: outputUri,
      width: TAB_AVATAR_ICON_POINTS,
      height: TAB_AVATAR_ICON_POINTS,
      scale: 2,
    };
  } catch (error) {
    console.warn('createNativeTabAvatarIconSource failed', error);
    return null;
  }
}
