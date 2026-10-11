/**
 * Files handed over by the share extension (`ios/NixShareExtension`) through the App Group
 * container: `nix://share-intake?file=<uuid>.<ext>&kind=photo|video`.
 */
export const SHARED_INTAKE_APP_GROUP = 'group.com.damianmotylinski.nixapp.uploads';
export const SHARED_INTAKE_FOLDER = 'SharedIntake';

export type SharedIntakeKind = 'photo' | 'video';

export type SharedIntakeRequest = { fileName: string; kind: SharedIntakeKind };

// The extension names files `<UUID>.<ext>`; anything else (paths, `..`) is rejected.
const FILE_NAME = /^[0-9A-Fa-f-]{36}\.[A-Za-z0-9]{1,5}$/;

export function parseSharedIntakeParams(params: {
  file?: string | string[];
  kind?: string | string[];
}): SharedIntakeRequest | null {
  const file = Array.isArray(params.file) ? params.file[0] : params.file;
  const kind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  if (!file || !FILE_NAME.test(file)) return null;
  if (kind !== 'photo' && kind !== 'video') return null;
  return { fileName: file, kind };
}

const VIDEO_EXTENSIONS = new Set(['mov', 'mp4', 'm4v', 'hevc']);

export function sharedIntakeKindForFile(fileName: string): SharedIntakeKind {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTENSIONS.has(extension) ? 'video' : 'photo';
}

/** A share waiting in the App Group container is offered for this long (the extension prunes after an hour). */
export const SHARED_INTAKE_PICKUP_WINDOW_MS = 10 * 60 * 1000;

/** The newest valid pending share, if it is recent enough to still be what the user wants. */
export function pickPendingSharedFile(
  files: readonly { name: string; createdAtMs: number }[],
  nowMs: number
): SharedIntakeRequest | null {
  const recent = files
    .filter((file) => parseSharedIntakeParams({ file: file.name, kind: 'photo' }) !== null)
    .filter((file) => nowMs - file.createdAtMs <= SHARED_INTAKE_PICKUP_WINDOW_MS)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  const newest = recent[0];
  return newest ? { fileName: newest.name, kind: sharedIntakeKindForFile(newest.name) } : null;
}
