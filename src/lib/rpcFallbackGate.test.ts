import { describe, expect, it } from 'vitest';
import { createRpcFallbackGate } from './rpcFallbackGate';

describe('rpc fallback gate', () => {
  it('skips the RPC during the cooldown and tries it again afterwards', () => {
    const gate = createRpcFallbackGate(1_000);
    expect(gate.shouldTryRpc(0)).toBe(true);
    gate.markUnavailable(100);
    expect(gate.shouldTryRpc(500)).toBe(false);
    expect(gate.shouldTryRpc(1_100)).toBe(true);
  });
});
