/**
 * Remembers that a new RPC is not deployed yet (client OTA shipped before the migration) so every
 * refetch does not pay a failing call — but only for a while: a stale PostgREST schema cache right
 * after the deploy, or a backend deployed while the app runs, must not pin the slow path until the
 * app is killed.
 */
export const RPC_FALLBACK_COOLDOWN_MS = 10 * 60_000;

export function createRpcFallbackGate(cooldownMs = RPC_FALLBACK_COOLDOWN_MS) {
  let unavailableUntil = 0;
  return {
    shouldTryRpc(now = Date.now()) {
      return now >= unavailableUntil;
    },
    markUnavailable(now = Date.now()) {
      unavailableUntil = now + cooldownMs;
    },
    reset() {
      unavailableUntil = 0;
    },
  };
}
