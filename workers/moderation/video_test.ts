import { command, processVideo } from "./video.ts";
function assert(value: unknown): asserts value {
  if (!value) throw new Error("assertion_failed");
}
async function fixture(run: (path: string) => Promise<void>) {
  const dir = await Deno.makeTempDir({ prefix: "nix-test-" });
  try {
    const path = `${dir}/safe.mp4`;
    await command("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=160x90:r=12:d=1",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      path,
    ], AbortSignal.timeout(5000));
    await run(path);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}
for (
  const mode of [
    "safe",
    "reject",
    "invalid",
    "429",
    "abort",
    "stalled",
  ] as const
) {
  Deno.test(`incremental ffmpeg pipeline: ${mode}`, async () => {
    await fixture(async (path) => {
      const controller = new AbortController();
      const tempParent = path.slice(0, path.lastIndexOf("/"));
      let active = 0, calls = 0, failed = false;
      try {
        const result = await processVideo(
          path,
          async (frame) => {
            assert(++active === 1 && frame.length > 0);
            calls++;
            active--;
            if (mode === "429") throw new Error("429");
            if (mode === "invalid") return {};
            if (mode === "abort") controller.abort();
            if (mode === "stalled") {
              setTimeout(() => controller.abort(), 10);
              return await new Promise<never>(() => {});
            }
            return {
              categoriesAnalysis: [{
                category: "Violence",
                severity: mode === "reject" ? 6 : 0,
              }],
            };
          },
          controller.signal,
          tempParent,
        );
        assert(
          result.decision === (mode === "reject" ? "rejected" : "approved"),
        );
        assert(result.frames === calls && result.frames > 1);
      } catch {
        failed = true;
      }
      assert(failed === ["invalid", "429", "abort", "stalled"].includes(mode));
      if (failed) assert(calls === 1);
      const entries = [];
      for await (const entry of Deno.readDir(tempParent)) {
        entries.push(entry.name);
      }
      assert(entries.length === 1 && entries[0] === "safe.mp4");
    });
  });
}
Deno.test("missing executable fails closed", async () => {
  let failed = false;
  try {
    await command("nix-nonexistent-command", [], new AbortController().signal);
  } catch {
    failed = true;
  }
  assert(failed);
});
