import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { CameraOrientation } from 'expo-camera';

/**
 * The camera UI is portrait-only, so a capture is always framed on a portrait screen. expo-camera
 * still reads the physical orientation from the accelerometer and reports `portraitUpsideDown`
 * when the phone tips past flat top-down (lying in bed, shooting overhead), which stores the
 * photo upside down although the preview looked upright. Landscape stays: it rotates on purpose.
 */
export function needsUprightRotation(orientation: CameraOrientation | null | undefined): boolean {
  return orientation === 'portraitUpsideDown';
}

/** The orientation the draft keeps once an upside-down capture has been turned upright. */
export function uprightCaptureOrientation(
  orientation: CameraOrientation | null | undefined
): CameraOrientation | undefined {
  if (!orientation) return undefined;
  return needsUprightRotation(orientation) ? 'portrait' : orientation;
}

/** Turns an upside-down still by 180° into a new JPEG; the original file is left as is. */
export async function rotatePhotoUpright(
  uri: string
): Promise<{ uri: string; width: number; height: number }> {
  const context = ImageManipulator.manipulate(uri).rotate(180);
  try {
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
      return { uri: saved.uri, width: saved.width, height: saved.height };
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}
