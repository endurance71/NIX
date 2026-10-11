import { describe, expect, it } from 'vitest';
import { parseSharedIntakeParams, pickPendingSharedFile, sharedIntakeKindForFile } from './sharedIntake';

describe('parseSharedIntakeParams', () => {
  const file = '3F2504E0-4F89-11D3-9A0C-0305E82C3301.jpg';

  it('accepts files named by the share extension', () => {
    expect(parseSharedIntakeParams({ file, kind: 'photo' })).toEqual({ fileName: file, kind: 'photo' });
    expect(parseSharedIntakeParams({ file: [file.replace('.jpg', '.mov')], kind: ['video'] })).toEqual({
      fileName: file.replace('.jpg', '.mov'),
      kind: 'video',
    });
  });

  it('rejects paths, traversal and unknown kinds', () => {
    expect(parseSharedIntakeParams({ file: '../Library/secret.jpg', kind: 'photo' })).toBeNull();
    expect(parseSharedIntakeParams({ file: `a/${file}`, kind: 'photo' })).toBeNull();
    expect(parseSharedIntakeParams({ file, kind: 'document' })).toBeNull();
    expect(parseSharedIntakeParams({ kind: 'photo' })).toBeNull();
  });
});

describe('pending shares', () => {
  const id = '3F2504E0-4F89-11D3-9A0C-0305E82C3301';

  it('detects videos by extension', () => {
    expect(sharedIntakeKindForFile(`${id}.MOV`)).toBe('video');
    expect(sharedIntakeKindForFile(`${id}.heic`)).toBe('photo');
  });

  it('picks the newest recent share and ignores stale or foreign files', () => {
    const now = 1_000_000_000;
    const picked = pickPendingSharedFile(
      [
        { name: `${id}.jpg`, createdAtMs: now - 60_000 },
        { name: `${id.replace('3F', '4F')}.mov`, createdAtMs: now - 5_000 },
        { name: 'notes.txt', createdAtMs: now },
        { name: `${id.replace('3F', '5F')}.jpg`, createdAtMs: now - 3_600_000 },
      ],
      now
    );
    expect(picked).toEqual({ fileName: `${id.replace('3F', '4F')}.mov`, kind: 'video' });
    expect(pickPendingSharedFile([{ name: `${id}.jpg`, createdAtMs: now - 3_600_000 }], now)).toBeNull();
  });
});
