import { describe, expect, it } from 'vitest';
import {
  incomingNixStatus,
  incomingTextStatus,
  messageStatusColor,
  messageStatusPresentation,
  outboxTextStatus,
  outgoingNixStatus,
  outgoingTextStatus,
} from './messageStatus';

describe('outgoingNixStatus', () => {
  it('is delivered until the receiver opens it', () => {
    expect(outgoingNixStatus({ status: 'sent', is_viewed: false })).toBe('delivered');
  });

  it('is opened once viewed, also after the media was cleaned', () => {
    expect(outgoingNixStatus({ status: 'viewed', is_viewed: true })).toBe('opened');
    expect(outgoingNixStatus({ status: 'cleaned', viewed_at: '2026-10-10T10:00:00Z' })).toBe('opened');
  });

  it('is replayed when the receiver used the replay', () => {
    expect(
      outgoingNixStatus({ status: 'viewed', is_viewed: true, is_replayed: true, replayed_at: '2026-10-10T10:01:00Z' })
    ).toBe('replayed');
  });

  it('never reports unplayable media as opened or replayed', () => {
    expect(
      outgoingNixStatus({
        status: 'cleaned',
        is_viewed: true,
        is_replayed: true,
        replayed_at: null,
        unplayable_at: '2026-10-10T10:00:00Z',
      })
    ).toBe('delivered');
  });

  it('falls back to the replay window on backends without replayed_at', () => {
    expect(
      outgoingNixStatus({ status: 'viewed', is_viewed: true, is_replayed: true, replay_expires_at: '2026-10-10T10:10:00Z' })
    ).toBe('replayed');
    // The legacy unplayable path clears the window: no replay to report.
    expect(
      outgoingNixStatus({ status: 'cleaned', is_viewed: true, is_replayed: true, replay_expires_at: null })
    ).toBe('opened');
  });

  it('does not use the legacy heuristic once the backend sends replayed_at', () => {
    expect(
      outgoingNixStatus({
        status: 'viewed',
        is_viewed: true,
        is_replayed: true,
        replay_expires_at: '2026-10-10T10:10:00Z',
        replayed_at: null,
      })
    ).toBe('opened');
  });
});

describe('text and incoming statuses', () => {
  it('marks a sent text opened once the receiver read it', () => {
    expect(outgoingTextStatus({ read_at: null })).toBe('delivered');
    expect(outgoingTextStatus({})).toBe('delivered');
    expect(outgoingTextStatus({ read_at: '2026-10-10T10:00:00Z' })).toBe('opened');
  });

  it('distinguishes new and received items', () => {
    expect(incomingNixStatus({ is_viewed: false })).toBe('newNix');
    expect(incomingNixStatus({ is_viewed: true })).toBe('received');
    expect(incomingTextStatus(true)).toBe('newMessage');
    expect(incomingTextStatus(false)).toBe('received');
  });

  it('maps the local outbox', () => {
    expect(outboxTextStatus('waiting_network')).toBe('waitingNetwork');
    expect(outboxTextStatus('failed')).toBe('failed');
  });
});

describe('messageStatusPresentation', () => {
  const colors = { accentText: 'accent', secondaryLabel: 'gray', destructive: 'danger' };

  it('shows the kind as a symbol, filled until opened', () => {
    expect(messageStatusPresentation('delivered', 'photo').icon).toBe('statusPhoto');
    expect(messageStatusPresentation('opened', 'photo').icon).toBe('statusPhotoOpened');
    expect(messageStatusPresentation('newNix', 'video').icon).toBe('statusVideo');
    expect(messageStatusPresentation('received', 'video').icon).toBe('statusVideoOpened');
    expect(messageStatusPresentation('newMessage', 'text').icon).toBe('statusText');
    expect(messageStatusPresentation('opened', 'text').icon).toBe('statusTextOpened');
    expect(messageStatusPresentation('replayed', 'photo').icon).toBe('statusReplayed');
    expect(messageStatusPresentation('sending', 'text').icon).toBe('clock');
  });

  it('uses the accent colour, and keeps pending and failed states neutral or red', () => {
    expect(messageStatusColor(messageStatusPresentation('opened', 'video').tone, colors)).toBe('accent');
    expect(messageStatusColor(messageStatusPresentation('delivered', 'photo').tone, colors)).toBe('accent');
    expect(messageStatusColor(messageStatusPresentation('sending', 'photo').tone, colors)).toBe('gray');
    expect(messageStatusColor(messageStatusPresentation('failed', 'text').tone, colors)).toBe('danger');
  });

  it('emphasises only unread incoming items', () => {
    expect(messageStatusPresentation('newNix', 'photo').emphasized).toBe(true);
    expect(messageStatusPresentation('received', 'photo').emphasized).toBe(false);
  });
});
