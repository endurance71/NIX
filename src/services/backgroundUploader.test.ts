import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeEnqueueOptions } from '../../modules/nix-background-uploader/src/NixBackgroundUploader.types';

const fixture = vi.hoisted(() => {
  type Result = { status: number } | null;
  type Progress = { totalBytesSent: number; totalBytesExpectedToSend: number };
  const tasks: { progress: (progress: Progress) => void; finish: (value: Result) => void }[] = [];
  return { tasks, finalize: vi.fn() };
});
vi.mock('../../modules/nix-background-uploader/src', () => ({ default: null }));
vi.mock('../config/uploadFeatures', () => ({ uploadFeatures: { nativeBackgroundUpload: false } }));
vi.mock('./mediaBatchUploadService', () => ({ finalizeMediaUploadBatch: fixture.finalize }));
vi.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 }, FileSystemSessionType: { BACKGROUND: 0 },
  createUploadTask: (_url: string, _uri: string, _options: unknown, progress: typeof fixture.tasks[number]['progress']) => {
    let finish!: typeof fixture.tasks[number]['finish'];
    const pending = new Promise<{ status: number } | null>((resolve) => { finish = resolve; });
    fixture.tasks.push({ progress, finish });
    return { uploadAsync: () => pending, cancelAsync: async () => { finish(null); } };
  },
}));

const options: NativeEnqueueOptions = {
  jobId: 'job', batchId: 'batch', fileUri: 'file:///image.jpg', uploadUrl: 'https://example.invalid/put',
  uploadHeaders: {}, finalizeUrl: 'https://example.invalid/finalize', finalizeHeaders: {}, finalizeToken: 'token',
  expiresAt: 99_999, mediaType: 'image', sizeBytes: 100, locale: 'en',
};
async function settle() { await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => { vi.resetModules(); fixture.tasks.length = 0; fixture.finalize.mockReset(); });

describe('durable PUT fallback control', () => {
  it('keeps pause through cancellation and late progress, then ignores the replaced attempt', async () => {
    const { backgroundUploader: uploader } = await import('./backgroundUploader');
    await uploader.enqueue(options);
    const old = fixture.tasks[0];
    await uploader.pause('job');
    old.progress({ totalBytesSent: 80, totalBytesExpectedToSend: 100 });
    await settle();
    expect((await uploader.listTasks())[0].state).toBe('paused');
    expect(fixture.finalize).not.toHaveBeenCalled();
    await uploader.resume('job');
    await uploader.enqueue(options);
    fixture.tasks[1].progress({ totalBytesSent: 20, totalBytesExpectedToSend: 100 });
    old.progress({ totalBytesSent: 99, totalBytesExpectedToSend: 100 });
    expect((await uploader.listTasks())[0]).toMatchObject({ state: 'uploading', progress: 0.2 });
  });
  it('defers a completed finalization response until explicit resume', async () => {
    let finalize!: (value: { status: 'completed' }) => void;
    fixture.finalize.mockImplementation(() => new Promise((resolve) => { finalize = resolve; }));
    const { backgroundUploader: uploader } = await import('./backgroundUploader');
    await uploader.enqueue(options);
    fixture.tasks[0].finish({ status: 200 });
    await settle();
    expect((await uploader.listTasks())[0].state).toBe('finalizing');
    await uploader.pause('job');
    finalize({ status: 'completed' });
    await settle();
    expect((await uploader.listTasks())[0]).toMatchObject({ state: 'paused', responseBody: '{"status":"completed"}' });
    await uploader.resume('job');
    expect((await uploader.listTasks())[0].state).toBe('completed');
  });
  it('does not create a task before the durable retry deadline', async () => {
    const { backgroundUploader: uploader } = await import('./backgroundUploader');
    expect(await uploader.enqueue({ ...options, nextRetryAt: Date.now() + 10_000 })).toMatchObject({ scheduled: false });
    expect(fixture.tasks).toHaveLength(0);
  });
  it('keeps cancellation through late success and explicit resume', async () => {
    const { backgroundUploader: uploader } = await import('./backgroundUploader');
    await uploader.enqueue(options);
    await uploader.cancel('job');
    fixture.tasks[0].progress({ totalBytesSent: 100, totalBytesExpectedToSend: 100 });
    await uploader.resume('job');
    expect((await uploader.listTasks())[0].state).toBe('cancelled');
    expect(fixture.finalize).not.toHaveBeenCalled();
  });
});
