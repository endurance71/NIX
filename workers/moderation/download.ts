import { MAX_INPUT_BYTES } from "./constants.ts";

export type StreamSource = {
  /** Readable byte stream; never pass URLs to ffmpeg. */
  stream: ReadableStream<Uint8Array>;
  /** Optional known size; if > MAX_INPUT_BYTES throws before reading. */
  contentLength?: number;
};

/**
 * Stream a remote/storage body to a local file with a hard 100 MiB cap
 * enforced during download. Returns the local path for ffmpeg.
 */
export async function streamDownloadToFile(
  source: StreamSource,
  destPath: string,
  signal: AbortSignal,
  maxBytes = MAX_INPUT_BYTES,
): Promise<{ bytesWritten: number; path: string }> {
  signal.throwIfAborted();
  if (
    typeof source.contentLength === "number" &&
    source.contentLength > maxBytes
  ) {
    throw new Error("input_size_limit");
  }

  const file = await Deno.open(destPath, {
    create: true,
    write: true,
    truncate: true,
  });
  let written = 0;
  try {
    const reader = source.stream.getReader();
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        written += value.byteLength;
        if (written > maxBytes) {
          throw new Error("input_size_limit");
        }
        await file.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    try {
      await Deno.remove(destPath);
    } catch { /* best-effort */ }
    throw error;
  } finally {
    file.close();
  }

  if (written === 0) {
    try {
      await Deno.remove(destPath);
    } catch { /* best-effort */ }
    throw new Error("input_empty");
  }

  return { bytesWritten: written, path: destPath };
}

/** Reject any ffmpeg input that looks like a URL. */
export function assertLocalMediaPath(path: string): void {
  if (/^https?:\/\//i.test(path) || path.includes("://")) {
    throw new Error("ffmpeg_remote_url_forbidden");
  }
}
