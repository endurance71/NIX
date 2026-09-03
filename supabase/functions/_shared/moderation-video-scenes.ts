export const DEFAULT_SCENE_THRESHOLD = 0.3;

export type SceneDetectionResult =
  | { ok: true; times: number[] }
  | { ok: false; error: "scene_detection_failed" | "ffmpeg_unavailable" };

export function parseSceneTimes(stderr: string, exitCode: number): number[] {
  if (exitCode !== 0) {
    throw new Error(`scene_detection_failed exit=${exitCode}`);
  }
  const times: number[] = [];
  for (const match of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) times.push(value);
  }
  return times;
}

export async function detectVideoSceneTimes(
  videoPath: string,
  threshold = DEFAULT_SCENE_THRESHOLD,
): Promise<SceneDetectionResult> {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    return { ok: false, error: "scene_detection_failed" };
  }
  try {
    const result = await new Deno.Command("ffmpeg", {
      args: [
        "-hide_banner",
        "-i",
        videoPath,
        "-vf",
        `select='gt(scene,${threshold})',showinfo`,
        "-an",
        "-f",
        "null",
        "-",
      ],
      stdout: "null",
      stderr: "piped",
    }).output();
    try {
      return {
        ok: true,
        times: parseSceneTimes(
          new TextDecoder().decode(result.stderr),
          result.code,
        ),
      };
    } catch {
      return { ok: false, error: "scene_detection_failed" };
    }
  } catch {
    return { ok: false, error: "ffmpeg_unavailable" };
  }
}
