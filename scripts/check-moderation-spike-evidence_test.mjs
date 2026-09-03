import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const checker = new URL('./check-moderation-spike-evidence.mjs', import.meta.url);

function makeEvidence() {
  const dir = mkdtempSync(join(tmpdir(), 'nix-c2-s0-'));
  mkdirSync(join(dir, 'runs'));
  writeFileSync(join(dir, 'resource-metadata.json'), JSON.stringify({
    region: 'Sweden Central',
    sku: 'S0',
    funding: 'promotional_credit',
    freeTrialActive: true,
    spendingLimitActive: true,
    creditBefore: 171.73,
    creditCurrency: 'EUR',
    creditExpiresAt: '2026-10-01',
    estimatedTestCostWith20pctBuffer: 10,
    usageConfirmedInPortal: true,
    monthlyUsageExactTxn: 0,
    billingOwner: 'subscription owner',
    verifiedAt: '2026-09-03T12:00:00Z',
  }));
  writeFileSync(join(dir, 'traffic-forecast.json'), JSON.stringify({
    status: 'COMPLETE',
    projectedMonthlyTxnWith20pctBuffer: 0,
    withinHardBudget4000: true,
    trafficInputs: {
      last30dText: 0,
      last30dUniqueImages: 0,
      last7dText: 0,
      last7dUniqueImages: 0,
      last30dVideosByBucket: { 15: 0, 60: 0, 180: 0 },
      last7dVideosByBucket: { 15: 0, 60: 0, 180: 0 },
    },
  }));
  writeFileSync(join(dir, 'latency-summary.json'), JSON.stringify({
    status: 'COMPLETE',
    workerBatchFitsLease: true,
  }));
  writeFileSync(join(dir, 'decision.md'), 'Verdict: Accepted\nADR status: Accepted\n');

  const common = {
    billingTier: 'S0',
    codeSha: 'a'.repeat(40),
    workingTreeClean: true,
    dryRun: false,
    azureTxn: 1,
  };
  const rows = [];
  for (let i = 0; i < 5; i += 1) rows.push({ ...common, kind: 'text', sampleId: `safe-${i}`, decision: 'approved', maxSeverity: 0 });
  for (let i = 0; i < 2; i += 1) rows.push({ ...common, kind: 'text', sampleId: `reject-${i}`, decision: 'rejected', maxSeverity: 4 });
  rows.push({ ...common, kind: 'image', sampleId: 'image-safe', decision: 'approved', maxSeverity: 0 });
  rows.push({ ...common, kind: 'image', sampleId: 'image-reject', decision: 'rejected', maxSeverity: 4 });

  for (const caseSet of ['safe', 'highrisk-start', 'highrisk-mid', 'highrisk-end', 'highrisk-scene']) {
    for (const durationTarget of [15, 60, 180]) {
      for (const strategy of ['baseline_1fps', 'uniform_scene_guard']) {
        const safe = caseSet === 'safe';
        rows.push({
          ...common,
          kind: 'video',
          caseSet,
          durationTarget,
          strategy,
          decision: safe ? 'approved' : 'rejected',
          maxSeverity: safe ? 0 : 4,
          coverage: strategy === 'baseline_1fps'
            ? 'baseline_1fps_full_timeline'
            : 'sampled_timeline_not_a_full_video_scan',
          providerRequestP95Ms: 100,
          videoDecisionTotalMs: 1000,
          sceneCount: caseSet === 'highrisk-scene' ? 1 : 0,
        });
      }
    }
  }
  for (let i = 0; i < 2; i += 1) {
    rows.push({
      ...common,
      kind: 'video',
      caseSet: 'safe',
      durationTarget: 180,
      strategy: 'uniform_scene_guard',
      decision: 'approved',
      maxSeverity: 0,
      coverage: 'sampled_timeline_not_a_full_video_scan',
      providerRequestP95Ms: 100,
      videoDecisionTotalMs: 1000,
      sceneCount: 0,
    });
  }
  const transactions = rows.reduce((sum, row) => sum + row.azureTxn, 0);
  rows.push({ ...common, kind: 'summary', transactions, projected: transactions, hardBudget: 2500 });
  writeFileSync(join(dir, 'runs', 'live.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  return dir;
}

function validate(dir) {
  return spawnSync(process.execPath, [checker.pathname, '--require-complete-s0'], {
    env: { ...process.env, SPIKE_EVIDENCE_DIR: dir },
    encoding: 'utf8',
  });
}

test('complete S0 evidence requires promotional credit and spending limit', () => {
  const dir = makeEvidence();
  try {
    const accepted = validate(dir);
    assert.equal(accepted.status, 0, accepted.stderr);

    const metadataPath = join(dir, 'resource-metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    metadata.spendingLimitActive = false;
    writeFileSync(metadataPath, JSON.stringify(metadata));
    const rejected = validate(dir);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /spending limit/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
