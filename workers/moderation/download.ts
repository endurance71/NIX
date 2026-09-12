import {
  JOB_TEMP_DIRNAME,
  MAX_INPUT_BYTES,
  MEDIA_VAULT_BUCKET,
} from "./constants.ts";
import { AZURE_IMAGE_MAX_BYTES } from "./azure-provider.ts";

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

/**
 * Normalize a Storage object key. Rejects URLs, traversal, and absolute paths.
 * Error strings must not include the original path.
 */
export function assertSafeObjectPath(path: string): string {
  const trimmed = path.trim();
  if (
    trimmed.length === 0 ||
    trimmed.includes("://") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0") ||
    trimmed.startsWith("/")
  ) {
    throw new Error("media_path_invalid");
  }
  const segments = trimmed.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error("media_path_invalid");
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error("media_path_invalid");
    }
  }
  return segments.join("/");
}

export function storageObjectUrl(
  supabaseUrl: string,
  objectPath: string,
  bucket = MEDIA_VAULT_BUCKET,
): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const safe = assertSafeObjectPath(objectPath);
  const encoded = safe.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`;
}

export function jobTempDir(override?: string): string {
  if (override && override.length > 0) return override;
  const tmp = Deno.env.get("TMPDIR")?.replace(/\/+$/, "") || "/tmp";
  return `${tmp}/${JOB_TEMP_DIRNAME}`;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value);
}

export async function jobDestPath(
  destDir: string,
  jobId: unknown,
): Promise<string> {
  await Deno.mkdir(destDir, { recursive: true });
  const name = isUuid(jobId) ? jobId : crypto.randomUUID();
  return `${destDir}/${name}`;
}

/** Best-effort delete of worker downloads only — never fixture or URL paths. */
export async function removeLocalJobFile(path: string): Promise<void> {
  const normalized = path.replaceAll("\\", "/");
  if (
    !normalized.includes(`/${JOB_TEMP_DIRNAME}/`) ||
    normalized.includes("://") ||
    normalized.includes("..")
  ) {
    return;
  }
  try {
    await Deno.remove(path);
  } catch {
    /* best-effort */
  }
}

export type MediaAssetMeta = {
  storagePath: string;
  mediaType: "image" | "video";
  sizeBytes: number | null;
};

function serviceHeaders(
  serviceRoleKey: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

export async function loadMediaAsset(
  supabaseUrl: string,
  serviceRoleKey: string,
  assetId: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<MediaAssetMeta> {
  if (!isUuid(assetId)) {
    throw new Error("media_asset_load_failed");
  }
  const base = supabaseUrl.replace(/\/+$/, "");
  const url =
    `${base}/rest/v1/media_assets?id=eq.${assetId}&select=storage_path,media_type,size_bytes,status`;
  const response = await fetchImpl(url, {
    headers: serviceHeaders(serviceRoleKey, {
      Accept: "application/vnd.pgrst.object+json",
    }),
  });
  const json = await response.json().catch(() => null) as {
    storage_path?: unknown;
    media_type?: unknown;
    size_bytes?: unknown;
    status?: unknown;
  } | null;
  if (!response.ok || typeof json?.storage_path !== "string") {
    throw new Error("media_asset_load_failed");
  }
  if (json.status === "deleted" || json.status === "deleting") {
    throw new Error("media_asset_unavailable");
  }
  if (json.media_type !== "image" && json.media_type !== "video") {
    throw new Error("media_type_invalid");
  }
  let sizeBytes: number | null = null;
  if (typeof json.size_bytes === "number" && Number.isFinite(json.size_bytes)) {
    sizeBytes = json.size_bytes;
  }
  if (sizeBytes !== null && sizeBytes <= 0) {
    throw new Error("input_empty");
  }
  if (json.media_type === "image" && sizeBytes !== null &&
    sizeBytes > AZURE_IMAGE_MAX_BYTES) {
    throw new Error("input_size_limit");
  }
  if (sizeBytes !== null && sizeBytes > MAX_INPUT_BYTES) {
    throw new Error("input_size_limit");
  }
  return {
    storagePath: json.storage_path,
    mediaType: json.media_type,
    sizeBytes,
  };
}

export async function downloadMediaVaultObject(
  supabaseUrl: string,
  serviceRoleKey: string,
  storagePath: string,
  destPath: string,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    knownSize?: number | null;
  } = {},
): Promise<{ bytesWritten: number; path: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = options.signal ?? AbortSignal.timeout(60_000);
  if (
    typeof options.knownSize === "number" &&
    options.knownSize > MAX_INPUT_BYTES
  ) {
    throw new Error("input_size_limit");
  }
  const url = storageObjectUrl(supabaseUrl, storagePath);
  const response = await fetchImpl(url, {
    headers: serviceHeaders(serviceRoleKey),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error("media_download_failed");
  }
  const headerLen = response.headers.get("content-length");
  const parsedHeader = headerLen ? Number(headerLen) : NaN;
  const contentLength = Number.isFinite(parsedHeader)
    ? parsedHeader
    : options.knownSize ?? undefined;
  const downloaded = await streamDownloadToFile(
    {
      stream: response.body,
      contentLength: typeof contentLength === "number"
        ? contentLength
        : undefined,
    },
    destPath,
    signal,
  );
  assertLocalMediaPath(downloaded.path);
  return downloaded;
}
