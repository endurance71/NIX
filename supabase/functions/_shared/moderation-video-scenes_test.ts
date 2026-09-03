import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectVideoSceneTimes,
  parseSceneTimes,
} from "./moderation-video-scenes.ts";

Deno.test("scene parser fails closed and reads ffmpeg timestamps", () => {
  assertEquals(parseSceneTimes("x pts_time:1.25 y pts_time:7.5", 0), [
    1.25,
    7.5,
  ]);
  assertThrows(() => parseSceneTimes("", 1));
});

Deno.test("scene detection rejects invalid threshold without running ffmpeg", async () => {
  assertEquals(await detectVideoSceneTimes("missing.mp4", 1.1), {
    ok: false,
    error: "scene_detection_failed",
  });
});

Deno.test("scene detection fails closed for a missing video", async () => {
  const result = await detectVideoSceneTimes("/definitely/missing/video.mp4");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(
      ["scene_detection_failed", "ffmpeg_unavailable"].includes(result.error),
      true,
    );
  }
});
