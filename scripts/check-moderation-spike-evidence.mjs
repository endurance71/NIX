#!/usr/bin/env node
/** Validate P0-3 spike evidence without reading fixture media or provider secrets. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const requireComplete = process.argv.includes('--require-complete');
const requireCompleteS0 = process.argv.includes('--require-complete-s0');
const requireHybridDelta = process.argv.includes('--require-hybrid-delta');
const completeRequested = requireComplete || requireCompleteS0;
if (requireComplete && requireCompleteS0) {
  console.error('choose only one complete evidence profile');
  process.exit(2);
}
const spikeDir = process.env.SPIKE_EVIDENCE_DIR?.trim()
  || join(process.env.HOME || '', '.nix-ops', 'p0-3-spike');
const failures = [];
const MEDIA_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic',
  '.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm',
]);
const REQUIRED = ['resource-metadata.json', 'latency-summary.json', 'traffic-forecast.json', 'decision.md'];

function walk(dir, relative = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const abs = join(dir, name);
    const rel = relative ? `${relative}/${name}` : name;
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs, rel));
    else out.push({ abs, rel, name });
  }
  return out;
}

function readJson(relative) {
  try {
    return JSON.parse(readFileSync(join(spikeDir, relative), 'utf8'));
  } catch (error) {
    failures.push(`invalid JSON ${relative}: ${error.message}`);
    return {};
  }
}

function looksLikeMedia(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  const ascii = bytes.toString('ascii');
  return ascii.startsWith('GIF8') || ascii.startsWith('RIFF') || ascii.slice(4, 12).includes('ftyp');
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function percentile95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = 0.95 * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] * (1 - (rank - low)) + sorted[high] * (rank - low);
}

if (!existsSync(spikeDir)) {
  console.error(`Spike evidence directory missing: ${spikeDir}`);
  process.exit(1);
}

const files = walk(spikeDir);
for (const file of files) {
  const ext = extname(file.name).toLowerCase();
  if (MEDIA_EXT.has(ext)) failures.push(`media forbidden in evidence dir: ${file.rel}`);
  if (file.name === 'env' || /\.(pem|p8)$/i.test(file.name)) failures.push(`secret-like file forbidden: ${file.rel}`);
  if (looksLikeMedia(readFileSync(file.abs).subarray(0, 16))) failures.push(`media signature forbidden in evidence dir: ${file.rel}`);

  if (/\.(json|jsonl|md|log|txt)$/i.test(file.name)) {
    const body = readFileSync(file.abs, 'utf8');
    if (/Ocp-Apim-Subscription-Key/i.test(body)
      || /AZURE_CONTENT_SAFETY_KEY\s*=\s*['"]?\S+/i.test(body)) {
      failures.push(`possible API key material in ${file.rel}`);
    }
    if (/https?:\/\/[^\s"']+\.(azure|blob|supabase)[^\s"']+/i.test(body) && /[?&]sig=/i.test(body)) {
      failures.push(`signed URL detected in ${file.rel}`);
    }
    if (/"categoriesAnalysis"\s*:/.test(body)) failures.push(`raw provider payload detected in ${file.rel}`);
    if (/\/\.nix-ops\/p0-3-fixtures\//.test(body) || /\/Downloads\/.*\.(mp4|jpe?g|mov)/i.test(body)) {
      failures.push(`fixture/media path leaked in ${file.rel}`);
    }
  }
}

for (const required of REQUIRED) {
  if (!existsSync(join(spikeDir, required))) failures.push(`missing required evidence file: ${required}`);
}

const runFiles = files.filter((file) => file.rel.startsWith('runs/') && file.name.endsWith('.jsonl'));
if (!runFiles.length) failures.push('missing runs/*.jsonl');

if (requireHybridDelta && failures.length === 0) {
  const rows = [];
  for (const file of runFiles) {
    const fileRows = readFileSync(file.abs, 'utf8').split(/\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
    rows.push(...fileRows);
    const summaries = fileRows.filter((row) => row.kind === 'summary' && row.dryRun !== true);
    if (summaries.length !== 1 || summaries[0].hardBudget > 3800 || summaries[0].projected > 3800) {
      failures.push(`${file.rel} must have one live summary within delta ceiling 3800`);
    }
    const logicalTxn = fileRows.filter((row) => row.kind !== 'summary' && row.dryRun !== true)
      .reduce((sum, row) => sum + (row.azureTxn ?? 0), 0);
    if (summaries[0] && summaries[0].transactions < logicalTxn) {
      failures.push(`${file.rel} transaction summary does not reconcile`);
    }
  }
  const dataRows = rows.filter((row) => row.dryRun !== true && row.kind !== 'summary');
  const shas = new Set(dataRows.map((row) => row.codeSha));
  if (shas.size !== 1 || !/^[0-9a-f]{40}$/.test([...shas][0] ?? '')
    || dataRows.some((row) => row.workingTreeClean !== true)) {
    failures.push('hybrid delta evidence must share one clean 40-character Git SHA');
  }
  for (const caseSet of ['hybrid-safe', 'hybrid-off-anchor']) {
    for (const durationTarget of [15, 60, 180]) {
      const match = dataRows.find((row) => row.kind === 'video' && row.caseSet === caseSet
        && row.durationTarget === durationTarget && row.strategy === 'uniform_scene_guard');
      const expectedDecision = caseSet === 'hybrid-safe' ? 'approved' : 'rejected';
      if (!match || match.decision !== expectedDecision
        || (expectedDecision === 'rejected' && !(match.maxSeverity >= 4))) {
        failures.push(`missing/failed hybrid delta ${caseSet} ${durationTarget}s`);
        continue;
      }
      if (match.coverage !== 'sampled_timeline_not_a_full_video_scan') {
        failures.push(`wrong hybrid coverage ${caseSet} ${durationTarget}s`);
      }
      if (!isNonNegativeNumber(match.videoDecisionTotalMs) || !isNonNegativeNumber(match.providerRequestP95Ms)) {
        failures.push(`missing hybrid latency ${caseSet} ${durationTarget}s`);
      }
      if (caseSet === 'hybrid-off-anchor' && !(match.sceneCount > 0)) {
        failures.push(`hybrid detector found no cut for ${durationTarget}s fixture`);
      }
    }
  }
}

if (completeRequested && failures.length === 0) {
  const metadata = readJson('resource-metadata.json');
  const forecast = readJson('traffic-forecast.json');
  const latency = readJson('latency-summary.json');
  const decision = readFileSync(join(spikeDir, 'decision.md'), 'utf8');

  if (String(metadata.region).toLowerCase() !== 'sweden central') failures.push('metadata region must be Sweden Central');
  if (requireCompleteS0) {
    if (String(metadata.sku).toUpperCase() !== 'S0'
      || metadata.funding !== 'promotional_credit'
      || metadata.freeTrialActive !== true
      || metadata.spendingLimitActive !== true) {
      failures.push('S0 metadata must confirm promotional credit, active Free Trial and spending limit');
    }
    if (!isNonNegativeNumber(metadata.creditBefore)
      || typeof metadata.creditCurrency !== 'string'
      || !metadata.creditCurrency
      || typeof metadata.creditExpiresAt !== 'string'
      || !metadata.creditExpiresAt
      || !isNonNegativeNumber(metadata.estimatedTestCostWith20pctBuffer)
      || metadata.estimatedTestCostWith20pctBuffer > metadata.creditBefore) {
      failures.push('S0 metadata must prove the buffered estimate fits the promotional credit');
    }
  } else if (String(metadata.sku).toUpperCase() !== 'F0' || metadata.noS0Created !== true) {
    failures.push('metadata must confirm F0 and no S0');
  }
  if (!metadata.usageConfirmedInPortal || !isNonNegativeNumber(metadata.monthlyUsageExactTxn)) {
    failures.push('metadata must contain exact Portal usage confirmation');
  }
  if (typeof metadata.billingOwner !== 'string' || /recorded_offline|unknown|todo/i.test(metadata.billingOwner)) {
    failures.push('metadata billingOwner must be concrete, not a placeholder');
  }
  if (typeof metadata.verifiedAt !== 'string' || !metadata.verifiedAt) failures.push('metadata verifiedAt is required');

  const traffic = forecast.trafficInputs ?? {};
  const scalarTraffic = [traffic.last30dText, traffic.last30dUniqueImages, traffic.last7dText, traffic.last7dUniqueImages];
  const bucketTraffic = [traffic.last30dVideosByBucket, traffic.last7dVideosByBucket]
    .flatMap((bucket) => ['15', '60', '180'].map((key) => bucket?.[key]));
  if (![...scalarTraffic, ...bucketTraffic].every(isNonNegativeNumber)) failures.push('forecast requires numeric 7d/30d production traffic');
  if (forecast.status !== 'COMPLETE' || !isNonNegativeNumber(forecast.projectedMonthlyTxnWith20pctBuffer)
    || forecast.projectedMonthlyTxnWith20pctBuffer > 4000 || forecast.withinHardBudget4000 !== true) {
    failures.push('forecast must be COMPLETE with 20% buffer <= 4000');
  }

  const rows = [];
  for (const file of runFiles) {
    const fileRows = [];
    for (const [index, line] of readFileSync(file.abs, 'utf8').split(/\n/).entries()) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        rows.push({ ...row, evidenceFile: file.rel });
        fileRows.push(row);
      } catch (error) {
        failures.push(`invalid JSONL ${file.rel}:${index + 1}: ${error.message}`);
      }
    }
    const liveRows = fileRows.filter((row) => row.dryRun !== true);
    if (liveRows.length) {
      const summaries = liveRows.filter((row) => row.kind === 'summary');
      if (summaries.length !== 1) failures.push(`${file.rel} must contain exactly one live summary row`);
      const logicalTxn = liveRows.filter((row) => row.kind !== 'summary').reduce((sum, row) => sum + (row.azureTxn ?? 0), 0);
      const evidenceBudget = requireCompleteS0 ? 2500 : 4000;
      if (summaries[0] && (!isNonNegativeNumber(summaries[0].transactions)
        || summaries[0].transactions < logicalTxn || summaries[0].projected > evidenceBudget)) {
        failures.push(`${file.rel} transaction summary does not reconcile or exceeds budget`);
      }
    }
  }

  const live = rows.filter((row) => row.dryRun !== true);
  const dataRows = live.filter((row) => row.kind !== 'summary');
  if (!dataRows.length) failures.push('complete evidence requires live rows');
  const expectedTier = requireCompleteS0 ? 'S0' : 'F0';
  if (dataRows.some((row) => row.billingTier != null && row.billingTier !== expectedTier)) {
    failures.push(`all live evidence must use billing tier ${expectedTier}`);
  }
  if (requireCompleteS0 && dataRows.some((row) => row.billingTier !== 'S0')) {
    failures.push('S0 evidence rows must explicitly record billingTier=S0');
  }
  const shas = new Set(dataRows.map((row) => row.codeSha));
  if (shas.size !== 1 || !/^[0-9a-f]{40}$/.test([...shas][0] ?? '') || dataRows.some((row) => row.workingTreeClean !== true)) {
    failures.push('all live evidence must share one clean 40-character Git SHA');
  }

  const textRows = dataRows.filter((row) => row.kind === 'text');
  if (textRows.filter((row) => row.decision === 'approved').length < 5
    || textRows.filter((row) => row.decision === 'rejected' && row.maxSeverity >= 4).length < 2) {
    failures.push('text evidence requires at least 5 safe approvals and 2 severity>=4 rejects');
  }
  const imageRows = dataRows.filter((row) => row.kind === 'image');
  if (!imageRows.some((row) => row.decision === 'approved')
    || !imageRows.some((row) => row.decision === 'rejected' && row.maxSeverity >= 4)) {
    failures.push('image evidence requires safe approval and severity>=4 reject');
  }

  const durations = [15, 60, 180];
  const strategies = ['baseline_1fps', 'uniform_scene_guard'];
  const videoCases = [
    { caseSet: 'safe', decision: 'approved' },
    { caseSet: 'highrisk-start', decision: 'rejected' },
    { caseSet: 'highrisk-mid', decision: 'rejected' },
    { caseSet: 'highrisk-end', decision: 'rejected' },
    { caseSet: 'highrisk-scene', decision: 'rejected' },
  ];
  for (const expected of videoCases) {
    for (const durationTarget of durations) {
      for (const strategy of strategies) {
        const match = dataRows.find((row) => row.kind === 'video' && row.caseSet === expected.caseSet
          && row.durationTarget === durationTarget && row.strategy === strategy);
        if (!match || match.decision !== expected.decision
          || (expected.decision === 'rejected' && !(match.maxSeverity >= 4))) {
          failures.push(`missing/failed video ${expected.caseSet} ${durationTarget}s ${strategy}`);
          continue;
        }
        const expectedCoverage = strategy === 'baseline_1fps'
          ? 'baseline_1fps_full_timeline'
          : 'sampled_timeline_not_a_full_video_scan';
        if (match.coverage !== expectedCoverage) failures.push(`wrong coverage ${expected.caseSet} ${durationTarget}s ${strategy}`);
        if (!isNonNegativeNumber(match.videoDecisionTotalMs) || !isNonNegativeNumber(match.providerRequestP95Ms)) {
          failures.push(`missing total/provider latency ${expected.caseSet} ${durationTarget}s ${strategy}`);
        }
        if (expected.caseSet === 'highrisk-scene' && strategy === 'uniform_scene_guard' && !(match.sceneCount > 0)) {
          failures.push(`scene detector found no cut for ${durationTarget}s scene fixture`);
        }
      }
    }
  }

  const uniform180Totals = dataRows.filter((row) => row.kind === 'video' && row.caseSet === 'safe'
    && row.durationTarget === 180 && row.strategy === 'uniform_scene_guard' && isNonNegativeNumber(row.videoDecisionTotalMs))
    .map((row) => row.videoDecisionTotalMs);
  const uniform180P95 = percentile95(uniform180Totals);
  if (uniform180Totals.length < 3 || uniform180P95 == null || uniform180P95 * 5 * 1.2 >= 900_000) {
    failures.push('uniform_scene_guard 180s needs >=3 total-latency samples and must fit 5-job/900s lease with 20% margin');
  }
  if (latency.status !== 'COMPLETE' || latency.workerBatchFitsLease !== true) {
    failures.push('latency-summary must be COMPLETE and confirm worker lease fit');
  }
  if (!/(ADR\s*(status\s*)?:?\s*Accepted|Verdict:\s*(GO|Accepted))/i.test(decision)) {
    failures.push('decision.md does not record Accepted/GO');
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const validationMode = requireCompleteS0 ? 'COMPLETE S0' : requireComplete ? 'COMPLETE F0' : requireHybridDelta ? 'HYBRID DELTA' : 'hygiene';
console.log(`Spike evidence ${validationMode} OK: ${spikeDir} (${files.length} files, no media/secrets).`);
