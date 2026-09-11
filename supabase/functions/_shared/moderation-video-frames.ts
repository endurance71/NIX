import {
  describeTimelineCoverage,
  resolveWorkerSamplingStrategy,
  type SamplingStrategy,
  timestampsForStrategy,
} from "./moderation-video-sampling.ts";
import { detectVideoSceneTimes } from "./moderation-video-scenes.ts";

export type ExtractedVideoFrames =
  | {
    ok: true;
    strategy: SamplingStrategy;
    durationSec: number;
    timestamps: number[];
    frames: Uint8Array[];
  }
  | { ok: false; error: string };

async function runCommand(
  bin: string,
  args: string[],
  opts: { stdout?: "piped" | "null"; stderr?: "piped" | "null" } = {},
) {
  return await new Deno.Command(bin, {
    args,
    stdout: opts.stdout ?? "null",
    stderr: opts.stderr ?? "null",
  }).output();
}

async function ffprobeDuration(path: string): Promise<number | null> {
  try {
    const result = await new Deno.Command("ffprobe", {
      args: [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
      ],
      stdout: "piped",
      stderr: "null",
    }).output();
    if (result.code !== 0) return null;
    const duration = Number(new TextDecoder().decode(result.stdout).trim());
    return duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

async function extractFrame(
  videoPath: string,
  timeSec: number,
  outPath: string,
): Promise<boolean> {
  try {
    const result = await runCommand("ffmpeg", [
      "-y",
      "-ss",
      timeSec.toFixed(3),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      outPath,
    ]);
    return result.code === 0;
  } catch {
    return false;
  }
}

export async function extractVideoFrames(
  videoBytes: Uint8Array,
  strategyRaw: string | undefined,
): Promise<ExtractedVideoFrames> {
  let strategy: SamplingStrategy;
  try {
    strategy = resolveWorkerSamplingStrategy(strategyRaw);
  } catch {
    return { ok: false, error: "invalid_video_sampling_strategy" };
  }

  let tmp = "";
  try {
    tmp = await Deno.makeTempDir({ prefix: "nix-moderation-video-" });
    const videoPath = `${tmp}/input.mp4`;
    await Deno.writeFile(videoPath, videoBytes);
    const durationSec = await ffprobeDuration(videoPath);
    if (durationSec == null) {
      return { ok: false, error: "ffprobe_failed" };
    }

    let sceneTimes: number[] = [];
    if (
      strategy === "uniform_scene_guard" || strategy === "scene_plus_anchors"
    ) {
      const sceneResult = await detectVideoSceneTimes(videoPath);
      if (!sceneResult.ok) return sceneResult;
      sceneTimes = sceneResult.times;
    }

    let timestamps: number[];
    try {
      timestamps = timestampsForStrategy(strategy, durationSec, sceneTimes);
    } catch (error) {
      if (
        error instanceof Error && error.message === "excessive_scene_changes"
      ) {
        return { ok: false, error: "excessive_scene_changes" };
      }
      return { ok: false, error: "invalid_video_sampling_strategy" };
    }
    const coverage = describeTimelineCoverage(
      timestamps,
      durationSec,
      strategy,
    );
    if (
      timestamps.length === 0 || !coverage.hasStart || !coverage.hasMid ||
      !coverage.hasEnd
    ) {
      return { ok: false, error: "insufficient_timeline_coverage" };
    }

    const frames: Uint8Array[] = [];
    for (const [index, time] of timestamps.entries()) {
      const framePath = `${tmp}/frame-${
        String(index + 1).padStart(3, "0")
      }.jpg`;
      const extracted = await extractFrame(videoPath, time, framePath);
      if (!extracted) {
        return { ok: false, error: "ffmpeg_extract_failed" };
      }
      frames.push(await Deno.readFile(framePath));
    }

    if (frames.length === 0) {
      return { ok: false, error: "no_frames" };
    }

    return { ok: true, strategy, durationSec, timestamps, frames };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "extract_exception";
    if (message.includes("No such file") || message.includes("os error 2")) {
      return { ok: false, error: "ffmpeg_unavailable" };
    }
    return { ok: false, error: "ffmpeg_unavailable" };
  } finally {
    if (tmp) {
      try {
        await Deno.remove(tmp, { recursive: true });
      } catch {
        // temp cleanup is best-effort; never approve on leftover files
      }
    }
  }
}
