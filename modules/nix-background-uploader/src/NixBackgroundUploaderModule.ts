import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  NativeBackgroundUploaderEvents,
  NativeEnqueueOptions,
  NativeUploadSnapshot,
} from './NixBackgroundUploader.types';

declare class NixBackgroundUploaderNativeModule extends NativeModule<NativeBackgroundUploaderEvents> {
  stageFile(jobId: string, sourceUri: string, fileName: string): Promise<{ uri: string; sizeBytes: number }>;
  findStagedFile(jobId: string, role: 'source' | 'prepared'): Promise<{ uri: string; sizeBytes: number } | null>;
  deleteStagedJob(jobId: string): Promise<void>;
  enqueue(options: NativeEnqueueOptions): Promise<{ scheduled: boolean; nativeTaskId?: number; duplicate?: boolean }>;
  pause(jobId: string): Promise<void>;
  resume(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
  listTasks(): Promise<NativeUploadSnapshot[]>;
  reconcile(): Promise<NativeUploadSnapshot[]>;
  syncLiveActivity(props: string): Promise<{ enabled: boolean; activeCount: number }>;
}

export default requireOptionalNativeModule<NixBackgroundUploaderNativeModule>('NixBackgroundUploader');
