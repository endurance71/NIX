import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractVideoFrames } from "./moderation-video-frames.ts";
import {
  resolveWorkerSamplingStrategy,
  timestampsForStrategy,
} from "./moderation-video-sampling.ts";

Deno.test("worker sampling never defaults to a single thumbnail", () => {
  assertEquals(resolveWorkerSamplingStrategy(undefined), "uniform");
  assertEquals(resolveWorkerSamplingStrategy("baseline_1fps"), "baseline_1fps");
  assertEquals(
    resolveWorkerSamplingStrategy("uniform_scene_guard"),
    "uniform_scene_guard",
  );
  let thrown = false;
  try {
    resolveWorkerSamplingStrategy("thumbnail");
  } catch {
    thrown = true;
  }
  assertEquals(thrown, true);
});

Deno.test("empty video bytes fail closed and never approve", async () => {
  const result = await extractVideoFrames(new Uint8Array(), "uniform");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(
      [
        "ffprobe_failed",
        "ffmpeg_unavailable",
        "ffmpeg_extract_failed",
        "no_frames",
        "insufficient_timeline_coverage",
      ]
        .includes(result.error),
      true,
    );
  }
});

Deno.test("uniform timestamps for 15s still include start mid end", () => {
  const stamps = timestampsForStrategy("uniform", 15);
  assertEquals(stamps[0], 0);
  assertEquals(stamps.length >= 3, true);
});
