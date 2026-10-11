import { describe, expect, it } from 'vitest';
import { isTerminalTextOutboxCode, textOutboxBackoffMs } from './textOutboxPolicy';

describe('text outbox retry policy', () => {
  it('automatically retries transport and server failures', () => {
    expect(isTerminalTextOutboxCode('NETWORK')).toBe(false);
    expect(isTerminalTextOutboxCode('TIMEOUT')).toBe(false);
    expect(isTerminalTextOutboxCode('SERVER_503')).toBe(false);
  });

  it('retries a rate limit automatically instead of failing the message', () => {
    expect(isTerminalTextOutboxCode('RATE_LIMITED')).toBe(false);
  });

  it('requires user interaction for permanent domain failures', () => {
    expect(isTerminalTextOutboxCode('NOT_FRIEND')).toBe(true);
    expect(isTerminalTextOutboxCode('UNAUTHORIZED')).toBe(true);
    expect(isTerminalTextOutboxCode('INVALID_INPUT')).toBe(true);
    expect(isTerminalTextOutboxCode('CONTENT_NOT_ALLOWED')).toBe(true);
  });

  it('caps exponential backoff at fifteen minutes', () => {
    expect(textOutboxBackoffMs(1)).toBe(2_000);
    expect(textOutboxBackoffMs(2)).toBe(4_000);
    expect(textOutboxBackoffMs(20)).toBe(15 * 60 * 1000);
  });

  it('waits at least a minute after a rate limit, still capped at fifteen minutes', () => {
    expect(textOutboxBackoffMs(1, 'RATE_LIMITED')).toBe(60_000);
    expect(textOutboxBackoffMs(7, 'RATE_LIMITED')).toBe(128_000);
    expect(textOutboxBackoffMs(20, 'RATE_LIMITED')).toBe(15 * 60 * 1000);
    expect(textOutboxBackoffMs(1, 'NETWORK')).toBe(2_000);
  });
});
