import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { sendQuickTextReply } from './viewerQuickReply';

const { enqueue, flush } = vi.hoisted(() => ({ enqueue: vi.fn(), flush: vi.fn() }));
vi.mock('../services/textOutboxService', () => ({ enqueueTextOutbox: enqueue, flushTextOutbox: flush }));
vi.mock('../services/textMessageService', () => ({ TEXT_MESSAGE_MAX_LENGTH: 2000 }));

const queryClient = { invalidateQueries: vi.fn(async () => undefined) } as unknown as QueryClient;

describe('sendQuickTextReply', () => {
  beforeEach(() => {
    enqueue.mockReset().mockResolvedValue(undefined);
    flush.mockReset().mockResolvedValue([]);
  });

  it('queues the reply with the NiX it answers', async () => {
    await expect(
      sendQuickTextReply({ ownerId: 'me', peerId: 'peer', body: ' Super ', online: false, queryClient, replyToNixId: 'nix-1' })
    ).resolves.toBe(true);
    expect(enqueue).toHaveBeenCalledWith('me', 'peer', 'Super', expect.any(String), 'nix-1');
  });

  it('queues a plain text when no NiX is given', async () => {
    await sendQuickTextReply({ ownerId: 'me', peerId: 'peer', body: 'Hej', online: true, queryClient });
    expect(enqueue).toHaveBeenCalledWith('me', 'peer', 'Hej', expect.any(String), null);
    expect(flush).toHaveBeenCalledWith('me');
  });
});
