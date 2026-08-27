/**
 * Sprint 3A sandbox spike for ADR-001. No production private content. No dummy allow.
 *
 *   AZURE_CONTENT_SAFETY_ENDPOINT=https://....cognitiveservices.azure.com \
 *   AZURE_CONTENT_SAFETY_KEY=... \
 *   SPIKE_JPEG=/path/to/safe.jpg \
 *   SPIKE_MP4_15=/path/to/15s.mp4 \
 *   SPIKE_MP4_60=/path/to/60s.mp4 \
 *   SPIKE_MP4_180=/path/to/180s.mp4 \
 *   npm run spike:moderation-provider
 *
 * Azure has no Video API. Strategies:
 *   baseline_1fps         — 1 frame/s on the full timeline (max 180). Only this may be called full-timeline.
 *   uniform               — 12 / 24 / 60 frames including start, mid, end. Not a full video scan.
 *   scene_plus_anchors    — scene cuts plus mandatory start/mid/end. Not a full video scan.
 *   contact_sheet         — one Azure image of tiled frames. Not a full video scan.
 *
 * Exit 2 = credentials/inputs missing (DoR). Exit 1 = provider or ffmpeg fail-closed.
 */
import {
  decideFromProviderAnalysis,
  POLICY_VERSION,
  type ModerationDecision,
  type ProviderAnalysis,
} from '../supabase/functions/_shared/moderation-policy.ts';
import {
  azureImageTransactions,
  baselineTimestamps,
  contactSheetGrid,
  describeTimelineCoverage,
  scenePlusAnchorTimestamps,
  type SamplingStrategy,
  uniformTimestamps,
} from '../supabase/functions/_shared/moderation-video-sampling.ts';

const API_VERSION = '2024-09-01';
const AZURE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const HUMAN_REVIEW_ENABLED = false;
const STRATEGIES: SamplingStrategy[] = [
  'baseline_1fps',
  'uniform',
  'scene_plus_anchors',
  'contact_sheet',
];

const endpoint = Deno.env.get('AZURE_CONTENT_SAFETY_ENDPOINT')?.replace(/\/+$/, '');
const key = Deno.env.get('AZURE_CONTENT_SAFETY_KEY');
const jpegPath = Deno.env.get('SPIKE_JPEG');
const mp4ByDuration = {
  15: Deno.env.get('SPIKE_MP4_15') ?? Deno.env.get('SPIKE_MP4'),
  60: Deno.env.get('SPIKE_MP4_60'),
  180: Deno.env.get('SPIKE_MP4_180'),
} as const;
const requestedStrategy = Deno.env.get('SPIKE_STRATEGY') ?? 'all';
const sceneThreshold = Number(Deno.env.get('SPIKE_SCENE_THRESHOLD') ?? '0.3');

if (!endpoint || !key) {
  console.error(
    'Sandbox spike blocked: set AZURE_CONTENT_SAFETY_ENDPOINT and AZURE_CONTENT_SAFETY_KEY. No dummy scan.'
  );
  Deno.exit(2);
}

const azureEndpoint: string = endpoint;
const azureKey: string = key;

const hasAnyMedia = Boolean(jpegPath || mp4ByDuration[15] || mp4ByDuration[60] || mp4ByDuration[180]);
if (!hasAnyMedia) {
  console.error(
    'Sandbox spike blocked: set SPIKE_JPEG and/or SPIKE_MP4_15, SPIKE_MP4_60, SPIKE_MP4_180. No dummy scan.'
  );
  Deno.exit(2);
}

let transactions = 0;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
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
  return decideFromProviderAnalysis(analysis, { humanReviewEnabled: HUMAN_REVIEW_ENABLED });
}

async function postAnalyze(kind: 'text' | 'image', body: unknown): Promise<ProviderAnalysis> {
  const response = await fetch(`${azureEndpoint}/contentsafety/${kind}:analyze?api-version=${API_VERSION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': azureKey,
    },
    body: JSON.stringify(body),
  });
  transactions += 1;
  if (!response.ok) {
    console.error(`provider ${kind} HTTP ${response.status} — fail-closed, not allow`);
    Deno.exit(1);
  }
  return await response.json() as ProviderAnalysis;
}

async function analyzeText(text: string) {
  return decide(
    await postAnalyze('text', {
      text,
      categories: ['Hate', 'SelfHarm', 'Sexual', 'Violence'],
      outputType: 'FourSeverityLevels',
    })
  );
}

async function analyzeImageBytes(bytes: Uint8Array) {
  if (bytes.byteLength > AZURE_IMAGE_MAX_BYTES) {
    console.error(`image ${bytes.byteLength} bytes exceeds Azure 4 MB limit — fail-closed`);
    Deno.exit(1);
  }
  return decide(
    await postAnalyze('image', {
      image: { content: bytesToBase64(bytes) },
      categories: ['Hate', 'SelfHarm', 'Sexual', 'Violence'],
      outputType: 'FourSeverityLevels',
    })
  );
}

async function runCommand(bin: string, args: string[], opts: { stderr?: 'piped' | 'null' } = {}) {
  const result = await new Deno.Command(bin, {
    args,
    stdout: 'null',
    stderr: opts.stderr ?? 'null',
  }).output();
  return result;
}

async function ffprobeDuration(path: string): Promise<number> {
  const result = await new Deno.Command('ffprobe', {
    args: ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
    stdout: 'piped',
    stderr: 'null',
  }).output();
  if (result.code !== 0) {
    console.error(`ffprobe failed for ${path}`);
    Deno.exit(1);
  }
  const duration = Number(new TextDecoder().decode(result.stdout).trim());
  if (!(duration > 0)) {
    console.error(`invalid duration for ${path}`);
    Deno.exit(1);
  }
  return duration;
}

async function extractFrame(videoPath: string, timeSec: number, outPath: string): Promise<void> {
  const result = await runCommand('ffmpeg', [
    '-y',
    '-ss',
    timeSec.toFixed(3),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    outPath,
  ]);
  if (result.code !== 0) {
    console.error(`ffmpeg extract failed at t=${timeSec}`);
    Deno.exit(1);
  }
}

async function detectScenes(videoPath: string): Promise<number[]> {
  const result = await runCommand(
    'ffmpeg',
    [
      '-hide_banner',
      '-i',
      videoPath,
      '-vf',
      `select='gt(scene,${sceneThreshold})',showinfo`,
      '-an',
      '-f',
      'null',
      '-',
    ],
    { stderr: 'piped' }
  );
  const stderr = new TextDecoder().decode(result.stderr);
  const times: number[] = [];
  for (const match of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
    times.push(Number(match[1]));
  }
  return times;
}

function timestampsFor(strategy: SamplingStrategy, durationSec: number, sceneTimes: number[]): number[] {
  if (strategy === 'baseline_1fps') return baselineTimestamps(durationSec);
  if (strategy === 'uniform' || strategy === 'contact_sheet') return uniformTimestamps(durationSec);
  return scenePlusAnchorTimestamps(durationSec, sceneTimes);
}

async function buildContactSheet(frameDir: string, frameCount: number, outPath: string): Promise<number> {
  const { cols, rows } = contactSheetGrid(frameCount);
  const needed = cols * rows;
  if (needed > frameCount) {
    const last = `${frameDir}/frame-${String(frameCount).padStart(3, '0')}.jpg`;
    for (let index = frameCount + 1; index <= needed; index += 1) {
      await Deno.copyFile(last, `${frameDir}/frame-${String(index).padStart(3, '0')}.jpg`);
    }
  }
  const result = await runCommand('ffmpeg', [
    '-y',
    '-start_number',
    '1',
    '-i',
    `${frameDir}/frame-%03d.jpg`,
    '-vf',
    `scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,tile=${cols}x${rows}`,
    '-frames:v',
    '1',
    '-q:v',
    '4',
    outPath,
  ]);
  if (result.code !== 0) {
    console.error('ffmpeg contact sheet failed');
    Deno.exit(1);
  }
  const size = (await Deno.stat(outPath)).size;
  if (size > AZURE_IMAGE_MAX_BYTES) {
    console.error(`contact sheet ${size} bytes exceeds Azure 4 MB limit — fail-closed`);
    Deno.exit(1);
  }
  return size;
}

const defaultTexts: Array<{ id: string; text: string }> = [
  { id: 'pl-safe', text: 'Cześć, wracam koło osiemnastej.' },
  { id: 'en-safe', text: 'See you at the office tomorrow morning.' },
  { id: 'pl-zwsp', text: 'Cześć\u200B, wracam koło osiemnastej.' },
  { id: 'en-spaced', text: 'S e e   y o u   t o m o r r o w.' },
  { id: 'pl-nfd', text: `${'Cześć'.normalize('NFD')}, wracam koło osiemnastej.` },
];

const extraTextPath = Deno.env.get('SPIKE_TEXT_FILE');
if (extraTextPath) {
  defaultTexts.push({ id: 'operator-file', text: await Deno.readTextFile(extraTextPath) });
}

console.log(`policy=${POLICY_VERSION} humanReview=${HUMAN_REVIEW_ENABLED} severity4=rejected`);

for (const sample of defaultTexts) {
  const result = await analyzeText(sample.text);
  console.log(`text id=${sample.id} decision=${result.decision} maxSeverity=${result.maxSeverity}`);
}

if (jpegPath) {
  const jpegDecision = await analyzeImageBytes(await Deno.readFile(jpegPath));
  console.log(`jpeg decision=${jpegDecision.decision} maxSeverity=${jpegDecision.maxSeverity} txn=1`);
}

const strategies =
  requestedStrategy === 'all' ? STRATEGIES : STRATEGIES.filter((strategy) => strategy === requestedStrategy);
if (requestedStrategy !== 'all' && strategies.length === 0) {
  console.error(`unknown SPIKE_STRATEGY=${requestedStrategy}`);
  Deno.exit(2);
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
};

const videoRows: VideoRow[] = [];

for (const durationTarget of [15, 60, 180] as const) {
  const videoPath = mp4ByDuration[durationTarget];
  if (!videoPath) {
    console.log(`mp4 ${durationTarget}s skipped — set SPIKE_MP4_${durationTarget}`);
    continue;
  }
  const durationActual = await ffprobeDuration(videoPath);
  if (Math.abs(durationActual - durationTarget) > 2) {
    console.log(`mp4 ${videoPath} duration=${durationActual.toFixed(2)}s (target ${durationTarget}s)`);
  }
  const sceneTimes = strategies.includes('scene_plus_anchors') ? await detectScenes(videoPath) : [];

  for (const strategy of strategies) {
    const stamps = timestampsFor(strategy, durationActual, sceneTimes);
    const coverage = describeTimelineCoverage(stamps, durationActual);
    if (!coverage.hasStart || !coverage.hasMid || !coverage.hasEnd) {
      console.error(`${strategy} missing start/mid/end on ${durationTarget}s clip — sampling rejected`);
      Deno.exit(1);
    }

    const tmp = await Deno.makeTempDir({ prefix: `nix-moderation-${durationTarget}-${strategy}-` });
    const framePaths: string[] = [];
    for (const [index, time] of stamps.entries()) {
      const framePath = `${tmp}/frame-${String(index + 1).padStart(3, '0')}.jpg`;
      await extractFrame(videoPath, time, framePath);
      framePaths.push(framePath);
    }

    let videoDecision: PolicyResult = {
      decision: 'approved',
      maxSeverity: 0,
      policyVersion: POLICY_VERSION,
    };

    if (strategy === 'contact_sheet') {
      const sheetPath = `${tmp}/contact-sheet.jpg`;
      const sheetBytes = await buildContactSheet(tmp, framePaths.length, sheetPath);
      const sheetDecision = await analyzeImageBytes(await Deno.readFile(sheetPath));
      videoDecision = sheetDecision;
      console.log(
        `mp4 ${durationTarget}s strategy=${strategy} frames=${framePaths.length} sheetBytes=${sheetBytes} coverage=${coverage.coverageClaim} decision=${sheetDecision.decision} maxSeverity=${sheetDecision.maxSeverity}`
      );
    } else {
      for (const [index, framePath] of framePaths.entries()) {
        const frameDecision = await analyzeImageBytes(await Deno.readFile(framePath));
        videoDecision = worse(videoDecision, frameDecision);
        console.log(
          `mp4 ${durationTarget}s strategy=${strategy} frame=${index + 1}/${framePaths.length} t=${stamps[index].toFixed(2)} decision=${frameDecision.decision} maxSeverity=${frameDecision.maxSeverity}`
        );
      }
    }

    const azureTxn = azureImageTransactions(strategy, framePaths.length);
    videoRows.push({
      durationTarget,
      durationActual,
      strategy,
      frames: framePaths.length,
      azureTxn,
      coverage: coverage.coverageClaim,
      hasStart: coverage.hasStart,
      hasMid: coverage.hasMid,
      hasEnd: coverage.hasEnd,
      decision: videoDecision.decision,
      maxSeverity: videoDecision.maxSeverity,
    });
    await Deno.remove(tmp, { recursive: true });
  }
}

console.log('--- cost/quality table (no media) ---');
for (const row of videoRows) {
  console.log(
    JSON.stringify({
      ...row,
      f0BudgetHint: `${row.azureTxn} / 5000 monthly image txns`,
    })
  );
}
console.log(`transactions=${transactions} f0MonthlyCap=5000`);
console.log('spike ok — record only decisions, never media. Strategies other than baseline_1fps are not a full video scan.');
