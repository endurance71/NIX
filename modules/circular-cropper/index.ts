import { requireNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';

let CircularCropper: any = null;
try {
  CircularCropper = requireNativeModule('CircularCropper');
} catch (e) {
  console.warn("[CircularCropper] Native module not found. Circular tab avatar will fall back to a square layout until the app is natively rebuilt.");
}

/**
 * Programmatically crops a local image file to a circle.
 * Adds alpha/transparency to the corners and saves the output as a PNG.
 * Falls back to copying the image as-is if the native module is not compiled.
 * 
 * @param sourceUri Local file path or file:// URI of the source image.
 * @param targetUri Local file path or file:// URI where the circular cropped PNG should be saved.
 * @returns A promise resolving to the target file URI (e.g. file://path/to/target.png).
 */
export async function cropToCircleAsync(sourceUri: string, targetUri: string): Promise<string> {
  const cleanSource = sourceUri.replace(/^file:\/\//, '');
  const cleanTarget = targetUri.replace(/^file:\/\//, '');

  if (!CircularCropper) {
    try {
      // Ensure the directory exists
      const targetDir = targetUri.substring(0, targetUri.lastIndexOf('/'));
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
      return targetUri;
    } catch (err) {
      console.warn("[CircularCropper] Failed to copy fallback square image:", err);
      return sourceUri;
    }
  }

  return await CircularCropper.cropToCircle(cleanSource, cleanTarget);
}
