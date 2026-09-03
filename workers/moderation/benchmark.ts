import {
  command,
  MAX_INPUT_BYTES,
  processVideo,
  type Provider,
} from "./video.ts";
const signal = AbortSignal.timeout(600_000);
const dir = await Deno.makeTempDir({ prefix: "nix-safe-" });
const provider: Provider = async (_frame, signal) => {
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 200);
    signal.addEventListener("abort", abort, { once: true });
  });
  return { categoriesAnalysis: [{ category: "Violence", severity: 0 }] };
};
const cases = [
  { id: "safe15", seconds: 15 },
  { id: "safe60", seconds: 60 },
  { id: "safe180a", seconds: 180 },
  { id: "safe180b", seconds: 180 },
  { id: "safe180c", seconds: 180 },
  { id: "cuts15", seconds: 15, cuts: true },
  { id: "excessive60", seconds: 60, cuts: true, error: true },
  { id: "boundary100MiB", seconds: 15, pad: MAX_INPUT_BYTES },
  { id: "over100MiB", seconds: 15, pad: MAX_INPUT_BYTES + 1, error: true },
  { id: "corrupt", seconds: 0, error: true },
];
try {
  for (const item of cases) {
    const path = `${dir}/safe.mp4`;
    if (!item.seconds) {
      await Deno.writeTextFile(path, "invalid synthetic media");
    } else {
      const source = item.cuts
        ? `nullsrc=s=640x360:r=24:d=${item.seconds},geq=lum='if(mod(floor(T*2),2),235,16)':cb=128:cr=128`
        : `color=c=blue:s=1280x720:r=24:d=${item.seconds}`;
      await command("ffmpeg", [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-filter_threads",
        "1",
        "-f",
        "lavfi",
        "-i",
        source,
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        path,
      ], signal);
      if (item.pad) await Deno.truncate(path, item.pad);
    }
    let calls = 0;
    const start = performance.now();
    let decision = "error", frames = 0, peakFrameBytes = 0;
    try {
      const result = await processVideo(path, async (frame, signal) => {
        calls++;
        return await provider(frame, signal);
      }, signal);
      decision = result.decision;
      frames = result.frames;
      peakFrameBytes = result.peakFrameBytes;
    } catch { /* fixed expected error; no paths or raw stderr */ }
    const pass = item.error
      ? decision === "error" && calls === 0
      : decision === "approved";
    console.log(
      JSON.stringify({
        caseId: item.id,
        pass,
        decision,
        frames,
        providerCalls: calls,
        azureRequests: 0,
        elapsedMs: Math.round(performance.now() - start),
        peakFrameBytes,
        fakeProviderDelayMs: 200,
      }),
    );
    await Deno.remove(path);
    if (!pass) throw new Error("benchmark_failed");
  }
} finally {
  await Deno.remove(dir, { recursive: true });
}
