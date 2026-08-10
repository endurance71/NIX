import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markViewerSlideUnplayable, markViewerSlideViewed } from './viewerSlideActions';

const { mockAcknowledge, mockMarkUnplayable, mockTrackEvent } = vi.hoisted(() => ({
  mockAcknowledge: vi.fn(),
  mockMarkUnplayable: vi.fn(),
  mockTrackEvent: vi.fn(),
}));

vi.mock('./viewedAckQueue', () => ({
  acknowledgeViewedNix: mockAcknowledge,
}));

vi.mock('../services/nixService', () => ({
  markNixUnplayable: mockMarkUnplayable,
}));

vi.mock('./telemetry', () => ({
  trackEvent: mockTrackEvent,
}));

describe('viewerSlideActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcknowledge.mockResolvedValue(true);
    mockMarkUnplayable.mockResolvedValue(undefined);
  });

  it('markViewerSlideViewed używa viewed ACK (nie unplayable)', async () => {
    const onDelivered = vi.fn();
    await markViewerSlideViewed(
      { id: 'nix-1', media_path: 'nixes/a/1.jpg' },
      'viewed',
      onDelivered
    );
    expect(mockAcknowledge).toHaveBeenCalledWith(
      { id: 'nix-1', media_path: 'nixes/a/1.jpg' },
      'viewed'
    );
    expect(mockMarkUnplayable).not.toHaveBeenCalled();
    expect(onDelivered).toHaveBeenCalled();
  });

  it('markViewerSlideUnplayable woła RPC bez viewed ACK i emituje telemetrię', async () => {
    const onDelivered = vi.fn();
    await markViewerSlideUnplayable(
      { id: 'nix-dead', media_path: 'nixes/a/dead.jpg' },
      'signed_url_failed',
      onDelivered
    );
    expect(mockMarkUnplayable).toHaveBeenCalledWith('nix-dead');
    expect(mockAcknowledge).not.toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'viewer_slide_unplayable',
      expect.objectContaining({ reason: 'signed_url_failed', nix_id: 'nix-dead' })
    );
    expect(onDelivered).toHaveBeenCalled();
  });
});
