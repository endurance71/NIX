export const DEFAULT_COMPRESSION_TIMEOUT_MS = 30_000;
const COMPRESSION_TIMEOUT_BASE_MS = 15_000;
const COMPRESSION_TIMEOUT_PER_MB_MS = 2_000;
const COMPRESSION_TIMEOUT_MAX_MS = 120_000;

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`Zbyt długi czas oczekiwania na kompresję (> ${Math.round(timeoutMs / 1000)}s).`));
      }, timeoutMs)
    ),
  ]);
}

export function getCompressionTimeout(fileSizeBytes: number | null | undefined): number {
  if (typeof fileSizeBytes !== 'number' || fileSizeBytes <= 0) return DEFAULT_COMPRESSION_TIMEOUT_MS;
  const sizeMb = fileSizeBytes / (1024 * 1024);
  return Math.min(COMPRESSION_TIMEOUT_MAX_MS, COMPRESSION_TIMEOUT_BASE_MS + sizeMb * COMPRESSION_TIMEOUT_PER_MB_MS);
}
