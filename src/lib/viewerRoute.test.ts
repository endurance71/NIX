import { describe, expect, it } from 'vitest';
import { classifyViewerFailure, serializeViewerOpenParams } from './viewerRoute';

describe('viewer route and failure policy', () => {
  it('przekazuje kompletny seed zdjęcia lub wideo', () => {
    expect(serializeViewerOpenParams({
      id: 'n1', path: 'asset/video.mp4', senderId: 's1', mediaType: 'video',
      viewDurationSec: 15, playbackDurationMs: 3200, thumbnailB64: 'thumb', isReplay: true,
    })).toMatchObject({ mediaType: 'video', viewDurationSec: '15', playbackDurationMs: '3200', isReplay: '1' });
  });

  it('rozróżnia autoryzację, trwały brak i błąd przejściowy', () => {
    expect(classifyViewerFailure({ status: 401 })).toBe('unauthorized');
    expect(classifyViewerFailure({ statusCode: '404', message: 'Object not found' })).toBe('permanentMissing');
    expect(classifyViewerFailure({ status: 503 })).toBe('transient');
    expect(classifyViewerFailure(new Error('offline'))).toBe('transient');
  });
});
