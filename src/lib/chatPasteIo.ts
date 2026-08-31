import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';
import type { ChatPasteIo } from './chatPaste';

function decodeBase64Header(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('unreadable');
}

async function defaultReadHeaderBytes(uri: string, length: number): Promise<Uint8Array> {
  const header = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    length,
    position: 0,
  });
  return decodeBase64Header(header);
}

async function defaultGetImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

async function defaultNormalizeImage(
  uri: string,
  format: 'jpeg' | 'png'
): Promise<{ uri: string; width: number; height: number }> {
  const context = ImageManipulator.manipulate(uri);
  try {
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({
        compress: format === 'jpeg' ? 0.9 : 1,
        format: format === 'jpeg' ? SaveFormat.JPEG : SaveFormat.PNG,
      });
      return { uri: saved.uri, width: saved.width, height: saved.height };
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}

export function createDefaultChatPasteIo(): ChatPasteIo {
  return {
    cacheDirectory: FileSystem.cacheDirectory ?? null,
    getInfo: async (uri) => {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return { exists: false };
      return { exists: true, size: 'size' in info ? info.size : undefined };
    },
    readHeaderBytes: defaultReadHeaderBytes,
    getImageSize: defaultGetImageSize,
    normalizeImage: defaultNormalizeImage,
    makeDirectory: async (uri) => {
      await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    },
    copyAsync: async (from, to) => {
      await FileSystem.copyAsync({ from, to });
    },
    deleteAsync: async (uri) => {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    },
  };
}
