import { LEASE_SECONDS, TEMP_PREFIX } from "./constants.ts";

export type ShutdownController = {
  requestStop: () => void;
  isStopping: () => boolean;
};

export function createShutdownController(): ShutdownController {
  let stopping = false;
  return {
    requestStop: () => {
      stopping = true;
    },
    isStopping: () => stopping,
  };
}

/**
 * Remove orphaned nix-frame-* temp directories older than the lease window.
 * Safe to call on worker start and after controlled shutdown.
 */
export async function cleanupOrphanTempDirs(
  parentDir: string,
  maxAgeMs = LEASE_SECONDS * 1000,
  now = Date.now(),
): Promise<number> {
  let removed = 0;
  try {
    for await (const entry of Deno.readDir(parentDir)) {
      if (!entry.isDirectory || !entry.name.startsWith(TEMP_PREFIX)) continue;
      const full = `${parentDir}/${entry.name}`;
      try {
        const st = await Deno.stat(full);
        const mtime = st.mtime?.getTime() ?? 0;
        if (now - mtime >= maxAgeMs) {
          await Deno.remove(full, { recursive: true });
          removed++;
        }
      } catch { /* skip races */ }
    }
  } catch { /* parent missing */ }
  return removed;
}
