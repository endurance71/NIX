/**
 * Sprint 3A sandbox spike for ADR-001. No production private content. No dummy allow.
 *
 * Modes:
 *   SPIKE_MODE=text|image|video|all
 *   SPIKE_DRY_RUN=1           — ffprobe/scene/cost only, zero Azure calls
 *   SPIKE_F0_USED_BEFORE=N    — required for live runs
 *   SPIKE_F0_HARD_BUDGET=N    — optional per-run ceiling, at most 4000
 *
 * Azure has no Video API. Strategies:
 *   baseline_1fps         — only this may be labeled full-timeline
 *   uniform / uniform_scene_guard / scene_plus_anchors / contact_sheet — sampled, never full scan
 *
 * Exit 2 = DoR / config. Exit 1 = provider, budget, expectation, or ffmpeg fail-closed.
 */
import {
  decideFromProviderAnalysis,
  type ModerationDecision,
  POLICY_VERSION,
  type ProviderAnalysis,
} from "../supabase/functions/_shared/moderation-policy.ts";
import {
  azureImageTransactions,
  contactSheetGrid,
  describeTimelineCoverage,
  type SamplingStrategy,
  timestampsForStrategy,
} from "../supabase/functions/_shared/moderation-video-sampling.ts";
import { detectVideoSceneTimes } from "../supabase/functions/_shared/moderation-video-scenes.ts";
import {
  assertExpectedDecision,
  canAffordLiveRun,
  type ExpectedDecision,
  F0_HARD_BUDGET,
  F0_MONTHLY_CAP,
  p95,
  parseCaseSet,
  parseExpectedDecision,
  parseSpikeMode,
  requireBudgetBeforeRequest,
  sanitizeSpikeRecord,
} from "./moderation-spike-lib.ts";

const API_VERSION = "2024-09-01";
const AZURE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const HUMAN_REVIEW_ENABLED = false;
const STRATEGIES: SamplingStrategy[] = [
  "baseline_1fps",
  "uniform",
  "uniform_scene_guard",
  "scene_plus_anchors",
  "contact_sheet",
];

const mode = parseSpikeMode(Deno.env.get("SPIKE_MODE"));
const caseSet = parseCaseSet(Deno.env.get("SPIKE_CASE_SET"));
const dryRun = Deno.env.get("SPIKE_DRY_RUN") === "1" ||
  Deno.env.get("SPIKE_DRY_RUN") === "true";
const endpoint = Deno.env.get("AZURE_CONTENT_SAFETY_ENDPOINT")?.replace(
  /\/+$/,
  "",
);
const key = Deno.env.get("AZURE_CONTENT_SAFETY_KEY");
const jpegPath = Deno.env.get("SPIKE_JPEG");
const jpegRejectPath = Deno.env.get("SPIKE_JPEG_REJECT");
const mp4ByDuration = {
  15: Deno.env.get("SPIKE_MP4_15") ?? Deno.env.get("SPIKE_MP4"),
  60: Deno.env.get("SPIKE_MP4_60"),
  180: Deno.env.get("SPIKE_MP4_180"),
} as const;
const requestedStrategy = Deno.env.get("SPIKE_STRATEGY") ?? "all";
const sceneThreshold = Number(Deno.env.get("SPIKE_SCENE_THRESHOLD") ?? "0.3");
const imageDelayMs = Math.max(
  0,
  Number(Deno.env.get("SPIKE_IMAGE_DELAY_MS") ?? "2500") || 2500,
);
const maxRetries = Math.max(
  1,
  Number(Deno.env.get("SPIKE_HTTP_RETRIES") ?? "8") || 8,
);
const jsonlPath = Deno.env.get("SPIKE_JSONL_OUT");
const usedBeforeRaw = Deno.env.get("SPIKE_F0_USED_BEFORE");
const runHardBudgetRaw = Deno.env.get("SPIKE_F0_HARD_BUDGET");
const runHardBudget = Number(runHardBudgetRaw ?? F0_HARD_BUDGET);

const expectText = parseExpectedDecision(Deno.env.get("SPIKE_EXPECT_TEXT"));
const expectJpeg = parseExpectedDecision(Deno.env.get("SPIKE_EXPECT_JPEG"));
const expectJpegReject = parseExpectedDecision(
  Deno.env.get("SPIKE_EXPECT_JPEG_REJECT") ?? "rejected",
);
const expectVideo = parseExpectedDecision(Deno.env.get("SPIKE_EXPECT_VIDEO"));

if (!dryRun && (!endpoint || !key)) {
  console.error(
    "Sandbox spike blocked: set AZURE_CONTENT_SAFETY_ENDPOINT and AZURE_CONTENT_SAFETY_KEY (or SPIKE_DRY_RUN=1).",
  );
  Deno.exit(2);
}

if (!dryRun && (usedBeforeRaw == null || usedBeforeRaw.trim() === "")) {
  console.error(
    "Live spike blocked: set SPIKE_F0_USED_BEFORE to current monthly F0 usage.",
  );
  Deno.exit(2);
}

const usedBefore = dryRun
  ? Number(usedBeforeRaw ?? "0") || 0
  : Number(usedBeforeRaw);
if (!Number.isFinite(usedBefore) || usedBefore < 0) {
  console.error(`invalid SPIKE_F0_USED_BEFORE=${usedBeforeRaw}`);
  Deno.exit(2);
}
if (
  !Number.isInteger(runHardBudget) || runHardBudget <= 0 ||
  runHardBudget > F0_HARD_BUDGET
) {
  console.error(
    `invalid SPIKE_F0_HARD_BUDGET=${
      runHardBudgetRaw ?? runHardBudget
    }; must be 1..${F0_HARD_BUDGET}`,
  );
  Deno.exit(2);
}

const azureEndpoint = endpoint ?? "";
const azureKey = key ?? "";
const gitEvidence = await readGitEvidence();

if (!dryRun && caseSet === "unspecified") {
  console.error(
    "Live spike blocked: set SPIKE_CASE_SET to a stable evidence identifier.",
  );
  Deno.exit(2);
}
if (!dryRun && !gitEvidence.workingTreeClean) {
  console.error(
    "Live spike blocked: evidence must be generated from a clean Git worktree.",
  );
  Deno.exit(2);
}

const runText = mode === "text" || mode === "all";
const runImage = mode === "image" || mode === "all";
const runVideo = mode === "video" || mode === "all";

if (runImage && !jpegPath && !jpegRejectPath) {
  console.error("SPIKE_MODE needs SPIKE_JPEG and/or SPIKE_JPEG_REJECT");
  Deno.exit(2);
}
if (
  runVideo && !mp4ByDuration[15] && !mp4ByDuration[60] && !mp4ByDuration[180]
) {
  console.error("SPIKE_MODE=video|all needs SPIKE_MP4_15 / _60 / _180");
  Deno.exit(2);
}
if (mode === "text" && !runText) {
  Deno.exit(2);
}

let transactions = 0;
const latenciesText: number[] = [];
const latenciesImage: number[] = [];
const latenciesByStrategy: Record<string, number[]> = {};
const videoTotalsByStrategy: Record<string, number[]> = {};
const jsonlRows: Record<string, unknown>[] = [];

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const rank: Record<ModerationDecision, number> = {
  approved: 0,
  review_required: 1,
  rejected: 2,
  error: 3,
};

type PolicyResult = ReturnType<typeof decideFromProviderAnalysis>;

function worse(left: PolicyResult, right: PolicyResult): PolicyResult {
  return rank[right.decision] > rank[left.decision] ? right : left;
}

function decide(analysis: ProviderAnalysis): PolicyResult {
  return decideFromProviderAnalysis(analysis, {
    humanReviewEnabled: HUMAN_REVIEW_ENABLED,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  const fromHeader = header ? Number(header) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader >= 0) {
    return fromHeader <= 180 ? fromHeader * 1000 : fromHeader;
  }
  return Math.min(60_000, 5_000 * 2 ** (attempt - 1));
}

function record(row: Record<string, unknown>) {
  jsonlRows.push(sanitizeSpikeRecord({
    caseSet,
    codeSha: gitEvidence.codeSha,
    workingTreeClean: gitEvidence.workingTreeClean,
    ...row,
  }));
}

async function readGitEvidence(): Promise<
  { codeSha: string; workingTreeClean: boolean }
> {
  const shaResult = await new Deno.Command("git", {
    args: ["rev-parse", "HEAD"],
    stdout: "piped",
    stderr: "null",
  }).output();
  const statusResult = await new Deno.Command("git", {
    args: ["status", "--porcelain", "--untracked-files=normal"],
    stdout: "piped",
    stderr: "null",
  }).output();
  if (shaResult.code !== 0 || statusResult.code !== 0) {
    return { codeSha: "git-unavailable", workingTreeClean: false };
  }
  return {
    codeSha: new TextDecoder().decode(shaResult.stdout).trim(),
    workingTreeClean:
      new TextDecoder().decode(statusResult.stdout).trim() === "",
  };
}

async function postAnalyze(kind: "text" | "image", body: unknown): Promise<{
  analysis: ProviderAnalysis;
  latencyMs: number;
  attemptLatenciesMs: number[];
}> {
  if (dryRun) {
    throw new Error("postAnalyze called during dry-run");
  }
  if (kind === "image" && imageDelayMs > 0) {
    await sleep(imageDelayMs);
  }

  const attemptLatenciesMs: number[] = [];
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      requireBudgetBeforeRequest(usedBefore, transactions, runHardBudget);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      Deno.exit(1);
    }

    const started = performance.now();
    const response = await fetch(
      `${azureEndpoint}/contentsafety/${kind}:analyze?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": azureKey,
        },
        body: JSON.stringify(body),
      },
    );
    const latencyMs = Math.round(performance.now() - started);
    attemptLatenciesMs.push(latencyMs);
    transactions += 1;

    if (response.ok) {
      const analysis = await response.json() as ProviderAnalysis;
      return { analysis, latencyMs, attemptLatenciesMs };
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxRetries) {
      console.error(
        `provider ${kind} HTTP ${response.status} — fail-closed, not allow`,
      );
      Deno.exit(1);
    }
    const waitMs = retryAfterMs(response, attempt);
    console.warn(
      `provider ${kind} HTTP ${response.status} attempt ${attempt}/${maxRetries}, wait ${waitMs}ms`,
    );
    await sleep(waitMs);
  }

  console.error(`provider ${kind} exhausted retries — fail-closed, not allow`);
  Deno.exit(1);
}

async function analyzeText(text: string) {
  const { analysis, latencyMs, attemptLatenciesMs } = await postAnalyze(
    "text",
    {
      text,
      categories: ["Hate", "SelfHarm", "Sexual", "Violence"],
      outputType: "FourSeverityLevels",
    },
  );
  latenciesText.push(...attemptLatenciesMs);
  return { ...decide(analysis), latencyMs, attemptLatenciesMs };
}

async function analyzeImageBytes(bytes: Uint8Array) {
  if (bytes.byteLength > AZURE_IMAGE_MAX_BYTES) {
    console.error(
      `image ${bytes.byteLength} bytes exceeds Azure 4 MB limit — fail-closed`,
    );
    Deno.exit(1);
  }
  const { analysis, latencyMs, attemptLatenciesMs } = await postAnalyze(
    "image",
    {
      image: { content: bytesToBase64(bytes) },
      categories: ["Hate", "SelfHarm", "Sexual", "Violence"],
      outputType: "FourSeverityLevels",
    },
  );
  latenciesImage.push(...attemptLatenciesMs);
  return { ...decide(analysis), latencyMs, attemptLatenciesMs };
}

async function runCommand(
  bin: string,
  args: string[],
  opts: { stderr?: "piped" | "null" } = {},
) {
  return await new Deno.Command(bin, {
    args,
    stdout: "null",
    stderr: opts.stderr ?? "null",
  }).output();
}

async function ffprobeDuration(path: string): Promise<number> {
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
  if (result.code !== 0) {
    console.error("ffprobe failed");
    Deno.exit(1);
  }
  const duration = Number(new TextDecoder().decode(result.stdout).trim());
  if (!(duration > 0)) {
    console.error("invalid duration");
    Deno.exit(1);
  }
  return duration;
}

async function extractFrame(
  videoPath: string,
  timeSec: number,
  outPath: string,
): Promise<void> {
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
  if (result.code !== 0) {
    console.error(`ffmpeg extract failed at t=${timeSec}`);
    Deno.exit(1);
  }
}

async function detectScenes(videoPath: string): Promise<number[]> {
  const result = await detectVideoSceneTimes(videoPath, sceneThreshold);
  if (result.ok) return result.times;
  console.error(result.error);
  Deno.exit(1);
}

async function buildContactSheet(
  frameDir: string,
  frameCount: number,
  outPath: string,
): Promise<number> {
  const { cols, rows } = contactSheetGrid(frameCount);
  const needed = cols * rows;
  if (needed > frameCount) {
    const last = `${frameDir}/frame-${String(frameCount).padStart(3, "0")}.jpg`;
    for (let index = frameCount + 1; index <= needed; index += 1) {
      await Deno.copyFile(
        last,
        `${frameDir}/frame-${String(index).padStart(3, "0")}.jpg`,
      );
    }
  }
  const result = await runCommand("ffmpeg", [
    "-y",
    "-start_number",
    "1",
    "-i",
    `${frameDir}/frame-%03d.jpg`,
    "-vf",
    `scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,tile=${cols}x${rows}`,
    "-frames:v",
    "1",
    "-q:v",
    "4",
    outPath,
  ]);
  if (result.code !== 0) {
    console.error("ffmpeg contact sheet failed");
    Deno.exit(1);
  }
  const size = (await Deno.stat(outPath)).size;
  if (size > AZURE_IMAGE_MAX_BYTES) {
    console.error(
      `contact sheet ${size} bytes exceeds Azure 4 MB limit — fail-closed`,
    );
    Deno.exit(1);
  }
  return size;
}

const strategies = requestedStrategy === "all"
  ? STRATEGIES
  : STRATEGIES.filter((strategy) => strategy === requestedStrategy);
if (requestedStrategy !== "all" && strategies.length === 0) {
  console.error(`unknown SPIKE_STRATEGY=${requestedStrategy}`);
  Deno.exit(2);
}

type TextSample = {
  id: string;
  text: string;
  expected: ExpectedDecision | null;
};

const textSamples: TextSample[] = [
  {
    id: "pl-safe",
    text: "Cześć, wracam koło osiemnastej.",
    expected: "approved",
  },
  {
    id: "en-safe",
    text: "See you at the office tomorrow morning.",
    expected: "approved",
  },
  {
    id: "pl-zwsp",
    text: "Cześć\u200B, wracam koło osiemnastej.",
    expected: "approved",
  },
  {
    id: "en-spaced",
    text: "S e e   y o u   t o m o r r o w.",
    expected: "approved",
  },
  {
    id: "pl-nfd",
    text: `${"Cześć".normalize("NFD")}, wracam koło osiemnastej.`,
    expected: "approved",
  },
];

const extraTextPath = Deno.env.get("SPIKE_TEXT_FILE");
if (extraTextPath) {
  textSamples.push({
    id: "operator-file",
    text: await Deno.readTextFile(extraTextPath),
    expected: expectText ?? "rejected",
  });
}

const rejectTextPath = Deno.env.get("SPIKE_TEXT_REJECT_FILE");
if (rejectTextPath) {
  const rejectLines = (await Deno.readTextFile(rejectTextPath))
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  for (const [index, line] of rejectLines.entries()) {
    textSamples.push({
      id: `reject-${index + 1}`,
      text: line,
      expected: "rejected",
    });
  }
}

// Pre-pass: estimate video txn for budget gate (live only).
type VideoPlan = {
  durationTarget: number;
  durationActual: number;
  strategy: SamplingStrategy;
  frames: number;
  azureTxn: number;
  coverage: string;
  path: string;
  sceneTimes: number[];
  preprocessingMs: number;
};

const videoPlans: VideoPlan[] = [];

if (runVideo) {
  for (const durationTarget of [15, 60, 180] as const) {
    const videoPath = mp4ByDuration[durationTarget];
    if (!videoPath) {
      console.log(
        `mp4 ${durationTarget}s skipped — set SPIKE_MP4_${durationTarget}`,
      );
      continue;
    }
    const ffprobeStarted = performance.now();
    const durationActual = await ffprobeDuration(videoPath);
    const ffprobeMs = Math.round(performance.now() - ffprobeStarted);
    const sceneStarted = performance.now();
    const needsSceneDetection = strategies.includes("scene_plus_anchors") ||
      strategies.includes("uniform_scene_guard");
    const sceneTimes = needsSceneDetection ? await detectScenes(videoPath) : [];
    const sceneDetectionMs = needsSceneDetection
      ? Math.round(performance.now() - sceneStarted)
      : 0;
    for (const strategy of strategies) {
      let stamps: number[];
      try {
        stamps = timestampsForStrategy(strategy, durationActual, sceneTimes);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        Deno.exit(1);
      }
      const coverage = describeTimelineCoverage(
        stamps,
        durationActual,
        strategy,
      );
      if (!coverage.hasStart || !coverage.hasMid || !coverage.hasEnd) {
        console.error(
          `${strategy} missing start/mid/end on ${durationTarget}s clip — sampling rejected`,
        );
        Deno.exit(1);
      }
      videoPlans.push({
        durationTarget,
        durationActual,
        strategy,
        frames: stamps.length,
        azureTxn: azureImageTransactions(strategy, stamps.length),
        coverage: coverage.coverageClaim,
        path: videoPath,
        sceneTimes,
        preprocessingMs: ffprobeMs +
          (strategy === "scene_plus_anchors" ||
              strategy === "uniform_scene_guard"
            ? sceneDetectionMs
            : 0),
      });
    }
  }
}

const estimateText = runText ? textSamples.length : 0;
const estimateImage = runImage
  ? Number(Boolean(jpegPath)) + Number(Boolean(jpegRejectPath))
  : 0;
const estimateVideo = videoPlans.reduce((sum, row) => sum + row.azureTxn, 0);
const estimateTotal = estimateText + estimateImage + estimateVideo;
const afford = canAffordLiveRun(usedBefore, estimateTotal, runHardBudget);

console.log(
  JSON.stringify({
    phase: "budget",
    dryRun,
    mode,
    usedBefore,
    estimateTotal,
    withReserve: afford.withReserve,
    projected: afford.projected,
    hardBudget: runHardBudget,
    monthlyCap: F0_MONTHLY_CAP,
    ok: afford.ok,
  }),
);

if (!dryRun && !afford.ok) {
  console.error(
    `Live spike blocked by hard budget ${runHardBudget}: used_before=${usedBefore} estimate=${estimateTotal} with_reserve=${afford.withReserve}`,
  );
  Deno.exit(1);
}

console.log(
  `policy=${POLICY_VERSION} humanReview=${HUMAN_REVIEW_ENABLED} severity4=rejected mode=${mode} dryRun=${dryRun} imageDelayMs=${imageDelayMs}`,
);

if (dryRun) {
  if (runText) {
    for (const sample of textSamples) {
      record({
        sampleId: sample.id,
        kind: "text",
        expected: sample.expected,
        azureTxn: 1,
        dryRun: true,
      });
      console.log(
        `text id=${sample.id} dryRun=1 expected=${
          sample.expected ?? "none"
        } txn=1`,
      );
    }
  }
  if (runImage) {
    if (jpegPath) {
      record({
        sampleId: "jpeg-safe",
        kind: "image",
        expected: expectJpeg ?? "approved",
        azureTxn: 1,
        dryRun: true,
      });
      console.log(
        `jpeg safe dryRun=1 expected=${expectJpeg ?? "approved"} txn=1`,
      );
    }
    if (jpegRejectPath) {
      record({
        sampleId: "jpeg-reject",
        kind: "image",
        expected: expectJpegReject ?? "rejected",
        azureTxn: 1,
        dryRun: true,
      });
      console.log(
        `jpeg reject dryRun=1 expected=${expectJpegReject ?? "rejected"} txn=1`,
      );
    }
  }
  for (const plan of videoPlans) {
    record({
      sampleId: `mp4-${plan.durationTarget}-${plan.strategy}`,
      kind: "video",
      durationTarget: plan.durationTarget,
      durationActual: plan.durationActual,
      strategy: plan.strategy,
      frames: plan.frames,
      azureTxn: plan.azureTxn,
      coverage: plan.coverage,
      expected: expectVideo,
      sceneCount: plan.sceneTimes.length,
      preprocessingMs: plan.preprocessingMs,
      dryRun: true,
    });
    console.log(
      JSON.stringify({
        durationTarget: plan.durationTarget,
        durationActual: plan.durationActual,
        strategy: plan.strategy,
        frames: plan.frames,
        azureTxn: plan.azureTxn,
        coverage: plan.coverage,
        sceneCount: plan.sceneTimes.length,
        preprocessingMs: plan.preprocessingMs,
        dryRun: true,
      }),
    );
  }
  console.log(
    `transactions=0 estimate=${estimateTotal} f0HardBudget=${runHardBudget} dryRun=1`,
  );
  console.log("spike dry-run ok — zero Azure requests");
} else {
  if (runText) {
    for (const sample of textSamples) {
      const result = await analyzeText(sample.text);
      try {
        assertExpectedDecision(
          sample.id,
          result.decision,
          sample.expected,
          result.maxSeverity,
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        Deno.exit(1);
      }
      record({
        sampleId: sample.id,
        kind: "text",
        decision: result.decision,
        maxSeverity: result.maxSeverity,
        expected: sample.expected,
        azureTxn: 1,
        latencyMs: result.latencyMs,
      });
      console.log(
        `text id=${sample.id} decision=${result.decision} maxSeverity=${result.maxSeverity} latencyMs=${result.latencyMs}`,
      );
    }
  }

  if (runImage && jpegPath) {
    const jpegDecision = await analyzeImageBytes(await Deno.readFile(jpegPath));
    try {
      assertExpectedDecision(
        "jpeg-safe",
        jpegDecision.decision,
        expectJpeg ?? "approved",
        jpegDecision.maxSeverity,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      Deno.exit(1);
    }
    record({
      sampleId: "jpeg-safe",
      kind: "image",
      decision: jpegDecision.decision,
      maxSeverity: jpegDecision.maxSeverity,
      expected: expectJpeg ?? "approved",
      azureTxn: 1,
      latencyMs: jpegDecision.latencyMs,
    });
    console.log(
      `jpeg safe decision=${jpegDecision.decision} maxSeverity=${jpegDecision.maxSeverity} latencyMs=${jpegDecision.latencyMs}`,
    );
  }

  if (runImage && jpegRejectPath) {
    const jpegDecision = await analyzeImageBytes(
      await Deno.readFile(jpegRejectPath),
    );
    try {
      assertExpectedDecision(
        "jpeg-reject",
        jpegDecision.decision,
        expectJpegReject ?? "rejected",
        jpegDecision.maxSeverity,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      Deno.exit(1);
    }
    record({
      sampleId: "jpeg-reject",
      kind: "image",
      decision: jpegDecision.decision,
      maxSeverity: jpegDecision.maxSeverity,
      expected: expectJpegReject ?? "rejected",
      azureTxn: 1,
      latencyMs: jpegDecision.latencyMs,
    });
    console.log(
      `jpeg reject decision=${jpegDecision.decision} maxSeverity=${jpegDecision.maxSeverity} latencyMs=${jpegDecision.latencyMs}`,
    );
  }

  type VideoRow = {
    durationTarget: number;
    durationActual: number;
    strategy: SamplingStrategy;
    frames: number;
    azureTxn: number;
    coverage: string;
    hasStart: boolean;
    hasMid: boolean;
    hasEnd: boolean;
    decision: ModerationDecision;
    maxSeverity: number | null;
    p95LatencyMs: number | null;
    videoDecisionTotalMs: number;
  };

  const videoRows: VideoRow[] = [];

  for (const plan of videoPlans) {
    const decisionStarted = performance.now();
    const stamps = timestampsForStrategy(
      plan.strategy,
      plan.durationActual,
      plan.sceneTimes,
    );
    const coverage = describeTimelineCoverage(
      stamps,
      plan.durationActual,
      plan.strategy,
    );
    const tmp = await Deno.makeTempDir({
      prefix: `nix-moderation-${plan.durationTarget}-${plan.strategy}-`,
    });
    const framePaths: string[] = [];
    for (const [index, time] of stamps.entries()) {
      const framePath = `${tmp}/frame-${
        String(index + 1).padStart(3, "0")
      }.jpg`;
      await extractFrame(plan.path, time, framePath);
      framePaths.push(framePath);
    }

    let videoDecision: PolicyResult = {
      decision: "approved",
      maxSeverity: 0,
      policyVersion: POLICY_VERSION,
    };
    const strategyLatencies: number[] = [];

    if (plan.strategy === "contact_sheet") {
      const sheetPath = `${tmp}/contact-sheet.jpg`;
      await buildContactSheet(tmp, framePaths.length, sheetPath);
      const sheetDecision = await analyzeImageBytes(
        await Deno.readFile(sheetPath),
      );
      videoDecision = sheetDecision;
      strategyLatencies.push(...sheetDecision.attemptLatenciesMs);
      console.log(
        `mp4 ${plan.durationTarget}s strategy=${plan.strategy} frames=${framePaths.length} coverage=${coverage.coverageClaim} decision=${sheetDecision.decision} maxSeverity=${sheetDecision.maxSeverity} latencyMs=${sheetDecision.latencyMs}`,
      );
    } else {
      for (const [index, framePath] of framePaths.entries()) {
        const frameDecision = await analyzeImageBytes(
          await Deno.readFile(framePath),
        );
        videoDecision = worse(videoDecision, frameDecision);
        strategyLatencies.push(...frameDecision.attemptLatenciesMs);
        console.log(
          `mp4 ${plan.durationTarget}s strategy=${plan.strategy} frame=${
            index + 1
          }/${framePaths.length} t=${
            stamps[index].toFixed(2)
          } decision=${frameDecision.decision} maxSeverity=${frameDecision.maxSeverity} latencyMs=${frameDecision.latencyMs}`,
        );
      }
    }

    try {
      assertExpectedDecision(
        `mp4-${plan.durationTarget}-${plan.strategy}`,
        videoDecision.decision,
        expectVideo,
        videoDecision.maxSeverity,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      await Deno.remove(tmp, { recursive: true }).catch(() => undefined);
      Deno.exit(1);
    }

    const azureTxn = azureImageTransactions(plan.strategy, framePaths.length);
    const strategyP95 = p95(strategyLatencies);
    const videoDecisionTotalMs = plan.preprocessingMs +
      Math.round(performance.now() - decisionStarted);
    latenciesByStrategy[plan.strategy] = [
      ...(latenciesByStrategy[plan.strategy] ?? []),
      ...strategyLatencies,
    ];
    videoTotalsByStrategy[plan.strategy] = [
      ...(videoTotalsByStrategy[plan.strategy] ?? []),
      videoDecisionTotalMs,
    ];
    videoRows.push({
      durationTarget: plan.durationTarget,
      durationActual: plan.durationActual,
      strategy: plan.strategy,
      frames: framePaths.length,
      azureTxn,
      coverage: coverage.coverageClaim,
      hasStart: coverage.hasStart,
      hasMid: coverage.hasMid,
      hasEnd: coverage.hasEnd,
      decision: videoDecision.decision,
      maxSeverity: videoDecision.maxSeverity,
      p95LatencyMs: strategyP95,
      videoDecisionTotalMs,
    });
    record({
      sampleId: `mp4-${plan.durationTarget}-${plan.strategy}`,
      kind: "video",
      durationTarget: plan.durationTarget,
      durationActual: plan.durationActual,
      strategy: plan.strategy,
      frames: framePaths.length,
      azureTxn,
      coverage: coverage.coverageClaim,
      decision: videoDecision.decision,
      maxSeverity: videoDecision.maxSeverity,
      expected: expectVideo,
      providerRequestP95Ms: strategyP95,
      videoDecisionTotalMs,
      sceneCount: plan.sceneTimes.length,
    });
    await Deno.remove(tmp, { recursive: true });
  }

  console.log("--- cost/quality table (no media) ---");
  for (const row of videoRows) {
    console.log(
      JSON.stringify({
        ...row,
        f0BudgetHint:
          `${row.azureTxn} image txns (hard ${runHardBudget} / cap ${F0_MONTHLY_CAP})`,
      }),
    );
  }
}

const latencySummary = {
  textP95Ms: p95(latenciesText),
  imageP95Ms: p95(latenciesImage),
  providerRequestP95ByStrategyMs: Object.fromEntries(
    Object.entries(latenciesByStrategy).map((
      [strategy, values],
    ) => [strategy, p95(values)]),
  ),
  videoDecisionTotalP95ByStrategyMs: Object.fromEntries(
    Object.entries(videoTotalsByStrategy).map((
      [strategy, values],
    ) => [strategy, p95(values)]),
  ),
};
console.log(`latency_summary=${JSON.stringify(latencySummary)}`);
console.log(
  `transactions=${transactions} usedBefore=${usedBefore} projected=${
    usedBefore + transactions
  } f0HardBudget=${runHardBudget} f0MonthlyCap=${F0_MONTHLY_CAP}`,
);

record({
  kind: "summary",
  dryRun,
  transactions,
  estimateTotal,
  usedBefore,
  projected: usedBefore + transactions,
  hardBudget: runHardBudget,
  monthlyCap: F0_MONTHLY_CAP,
  latencySummary,
});

if (jsonlPath) {
  const lines = jsonlRows.map((row) => JSON.stringify(row)).join("\n") +
    (jsonlRows.length ? "\n" : "");
  await Deno.writeTextFile(jsonlPath, lines);
  console.log(`jsonl_written rows=${jsonlRows.length}`);
}

console.log(
  dryRun
    ? "spike dry-run ok — record only estimates, never media."
    : "spike ok — record only decisions, never media. Strategies other than baseline_1fps are not a full video scan.",
);
