import { uniformSceneGuardTimestamps } from "../../supabase/functions/_shared/moderation-video-sampling.ts";
import { parseSceneTimes } from "../../supabase/functions/_shared/moderation-video-scenes.ts";
import {
  decideFromProviderAnalysis,
  type ProviderAnalysis,
  worsePolicyResult,
} from "../../supabase/functions/_shared/moderation-policy.ts";

export const MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const COVERAGE = "sampled_timeline_not_a_full_video_scan";
export type Provider = (
  frame: Uint8Array,
  signal: AbortSignal,
) => Promise<ProviderAnalysis>;

export async function abortable<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("job_timeout"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(operation).then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", abort)
    );
  });
}

/** Bounded output; cancellation kills and reaps the child before returning. */
export async function command(
  bin: string,
  args: string[],
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const child = new Deno.Command(bin, {
    args,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const kill = () => {
    try {
      child.kill("SIGKILL");
    } catch { /* already exited */ }
  };
  signal.addEventListener("abort", kill, { once: true });
  async function read(stream: ReadableStream<Uint8Array>) {
    let text = "", size = 0;
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        kill();
        throw new Error("subprocess_output_limit");
      }
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  }
  try {
    const results = await Promise.allSettled([
      read(child.stdout),
      read(child.stderr),
      child.status,
    ]);
    signal.throwIfAborted();
    const [out, err, status] = results;
    if (
      out.status !== "fulfilled" || err.status !== "fulfilled" ||
      status.status !== "fulfilled" || !status.value.success
    ) {
      throw new Error("subprocess_failed");
    }
    return out.value + err.value;
  } finally {
    kill();
    await child.status;
    signal.removeEventListener("abort", kill);
  }
}

export async function processVideo(
  path: string,
  provider: Provider,
  signal: AbortSignal,
  tempParent?: string,
) {
  signal.throwIfAborted();
  const stat = await Deno.stat(path);
  if (!stat.isFile || stat.size === 0 || stat.size > MAX_INPUT_BYTES) {
    throw new Error("input_size_limit");
  }
  const probe = await command("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path,
  ], signal);
  const duration = Number(probe.trim());
  if (!Number.isFinite(duration) || duration <= 0 || duration > 180) {
    throw new Error("duration_limit");
  }
  const sceneLog = await command("ffmpeg", [
    "-hide_banner",
    "-nostdin",
    "-threads",
    "1",
    "-filter_threads",
    "1",
    "-i",
    path,
    "-vf",
    "select='gt(scene,0.3)',showinfo",
    "-an",
    "-f",
    "null",
    "-",
  ], signal);
  // Plan the complete set before any provider call; never silently truncate it.
  const timestamps = uniformSceneGuardTimestamps(
    duration,
    parseSceneTimes(sceneLog, 0),
  );
  const dir = await Deno.makeTempDir({ prefix: "nix-frame-", dir: tempParent });
  let result = decideFromProviderAnalysis({
    categoriesAnalysis: [{ category: "Violence", severity: 0 }],
  });
  let frames = 0, peakFrameBytes = 0;
  try {
    for (const timestamp of timestamps) {
      signal.throwIfAborted();
      const framePath = `${dir}/frame.jpg`;
      // The nominal end anchor may lie after the last frame (e.g. 12 fps).
      // Decode the last second into one repeatedly overwritten JPEG, not an array.
      const endAnchor = timestamp === timestamps.at(-1);
      await command("ffmpeg", [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        ...(endAnchor ? ["-sseof", "-1"] : ["-ss", timestamp.toFixed(3)]),
        "-i",
        path,
        ...(endAnchor ? ["-update", "1"] : ["-frames:v", "1"]),
        "-q:v",
        "3",
        "-threads",
        "1",
        framePath,
      ], signal);
      const frameStat = await Deno.stat(framePath);
      if (frameStat.size === 0 || frameStat.size > 4 * 1024 * 1024) {
        throw new Error("frame_size_limit");
      }
      const frame = await Deno.readFile(framePath);
      peakFrameBytes = Math.max(peakFrameBytes, frame.length);
      const analysis = await abortable(() => provider(frame, signal), signal);
      signal.throwIfAborted();
      const decision = decideFromProviderAnalysis(analysis);
      if (decision.decision === "error") {
        throw new Error("provider_invalid_response");
      }
      result = worsePolicyResult(result, decision);
      frames++;
      await Deno.remove(framePath);
    }
    return { ...result, frames, peakFrameBytes, duration, coverage: COVERAGE };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}
