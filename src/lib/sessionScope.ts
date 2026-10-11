/** Account lifetime, separate from token refresh: old work never follows a new login. */
let owner: string | null = null;
let generation = 0;
let lifetime = new AbortController();

export class SessionScopeCancelledError extends Error {
  constructor() { super('Account session changed'); this.name = 'AbortError'; }
}

export function cancelSessionRequests() {
  generation += 1;
  lifetime.abort();
  lifetime = new AbortController();
}

export function setSessionOwner(nextOwner: string | null) {
  if (nextOwner !== owner) cancelSessionRequests();
  owner = nextOwner;
}

export function sessionGeneration() { return generation; }

export function captureSessionScope(expectedOwner: string, expectedGeneration = generation) {
  const capturedLifetime = lifetime;
  const assertActive = () => {
    if (owner !== expectedOwner || generation !== expectedGeneration || capturedLifetime.signal.aborted) {
      throw new SessionScopeCancelledError();
    }
  };
  assertActive();
  return { ownerId: expectedOwner, generation: expectedGeneration, signal: capturedLifetime.signal, assertActive };
}
