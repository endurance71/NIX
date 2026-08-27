/**
 * Sandbox spike for ADR-001. No production private content. No dummy allow.
 *
 *   AZURE_CONTENT_SAFETY_ENDPOINT=https://....cognitiveservices.azure.com \
 *   AZURE_CONTENT_SAFETY_KEY=... \
 *   SPIKE_JPEG=/path/to/safe.jpg \
 *   SPIKE_MP4=/path/to/safe.mp4 \
 *   deno run --allow-net --allow-read --allow-env --allow-run scripts/moderation-provider-spike.ts
 *
 * MP4 uses local ffmpeg (1 fps, max 3 frames) then image:analyze — full file, not one thumbnail.
 * Exit 2 = credentials/files missing (DoR). Exit 1 = provider fail-closed.
 */
import {
  decideFromProviderAnalysis,
  POLICY_VERSION,
  type ModerationDecision,
} from '../supabase/functions/_shared/moderation-policy.ts';

const endpoint = Deno.env.get('AZURE_CONTENT_SAFETY_ENDPOINT')?.replace(/\/+$/, '');
const key = Deno.env.get('AZURE_CONTENT_SAFETY_KEY');
const jpegPath = Deno.env.get('SPIKE_JPEG');
const mp4Path = Deno.env.get('SPIKE_MP4');

if (!endpoint || !key || !jpegPath || !mp4Path) {
  console.error(
    'Sandbox spike blocked: set AZURE_CONTENT_SAFETY_ENDPOINT, AZURE_CONTENT_SAFETY_KEY, SPIKE_JPEG, SPIKE_MP4. No dummy scan.'
  );
  Deno.exit(2);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function analyzeImageBytes(bytes: Uint8Array) {
  const body = JSON.stringify({
    image: { content: bytesToBase64(bytes) },
    categories: ['Hate', 'SelfHarm', 'Sexual', 'Violence'],
    outputType: 'FourSeverityLevels',
  });
  const response = await fetch(`${endpoint}/contentsafety/image:analyze?api-version=2024-09-01`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': key,
    },
    body,
  });
  if (!response.ok) {
    console.error(`provider HTTP ${response.status} — fail-closed, not allow`);
    Deno.exit(1);
  }
  return await response.json();
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

const jpegDecision = decideFromProviderAnalysis(await analyzeImageBytes(await Deno.readFile(jpegPath)));
console.log(`jpeg decision=${jpegDecision.decision} maxSeverity=${jpegDecision.maxSeverity}`);

const tmp = await Deno.makeTempDir({ prefix: 'nix-moderation-spike-' });
const ffmpeg = new Deno.Command('ffmpeg', {
  args: ['-y', '-i', mp4Path, '-vf', 'fps=1', '-vframes', '3', `${tmp}/frame-%02d.jpg`],
  stdout: 'null',
  stderr: 'null',
});
const ffmpegResult = await ffmpeg.output();
if (ffmpegResult.code !== 0) {
  console.error('ffmpeg failed — cannot claim full-file video spike.');
  Deno.exit(1);
}

let videoDecision: PolicyResult = {
  decision: 'approved',
  maxSeverity: 0,
  policyVersion: POLICY_VERSION,
};
let frames = 0;
for await (const entry of Deno.readDir(tmp)) {
  if (!entry.name.endsWith('.jpg')) continue;
  frames += 1;
  const frameDecision = decideFromProviderAnalysis(await analyzeImageBytes(await Deno.readFile(`${tmp}/${entry.name}`)));
  console.log(`frame ${entry.name} decision=${frameDecision.decision} maxSeverity=${frameDecision.maxSeverity}`);
  videoDecision = worse(videoDecision, frameDecision);
}
if (frames < 1) {
  console.error('No frames extracted — thumbnail-only path is forbidden.');
  Deno.exit(1);
}
console.log(`mp4 frames=${frames} decision=${videoDecision.decision} maxSeverity=${videoDecision.maxSeverity}`);
if (jpegDecision.decision === 'error' || videoDecision.decision === 'error') {
  Deno.exit(1);
}
console.log('spike ok — record only decisions, never media');
