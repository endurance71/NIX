import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  NativeBackgroundUploaderEvents,
  NativeEnqueueOptions,
  NativeUploadSnapshot,
} from './NixBackgroundUploader.types';

declare class NixBackgroundUploaderNativeModule extends NativeModule<NativeBackgroundUploaderEvents> {
  downloadPhotoToMemory(requestId: string, url: string, bearerToken: string, maxBytes: number): Promise<{ base64: string; contentType: string }>;
  cancelPhotoDownload(requestId: string): Promise<void>;
  savePhotoToLibrary(base64: string, contentType: string): Promise<void>;
  stageFile(jobId: string, sourceUri: string, fileName: string): Promise<{ uri: string; sizeBytes: number }>;
  findStagedFile(jobId: string, role: 'source' | 'prepared'): Promise<{ uri: string; sizeBytes: number } | null>;
  deleteStagedJob(jobId: string): Promise<void>;
  enqueue(options: NativeEnqueueOptions): Promise<{ scheduled: boolean; nativeTaskId?: number; duplicate?: boolean }>;
  pause(jobId: string): Promise<void>;
  resume(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
  listTasks(): Promise<NativeUploadSnapshot[]>;
  reconcile(): Promise<NativeUploadSnapshot[]>;
  /**
   * Delegates one Live Activity write to native. In the background native publishes its merged
   * queue view (single writer, SEND-2); in front it starts/updates with `props` as given.
   */
  syncLiveActivity(props: string): Promise<{ enabled: boolean; activeCount: number }>;
  /**
   * JSON `UploadLiveActivityNativeState` — JS queue view the native background writer merges
   * with URLSession snapshots. Optional: binaries built before SEND-2 do not expose it.
   */
  reportLiveActivityState?(state: string): Promise<void>;
}

export default requireOptionalNativeModule<NixBackgroundUploaderNativeModule>('NixBackgroundUploader');
