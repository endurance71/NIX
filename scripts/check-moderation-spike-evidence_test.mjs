import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  computeEvidenceManifestDigest,
  parseActiveConsent,
} from './s0-portal-exception-lib.mjs';

const checker = new URL('./check-moderation-spike-evidence.mjs', import.meta.url);

const CODE_SHA = 'e75dd9df570e16b7ee40c7a3cea1b1b85af9d767';

function writeActive(path, overrides = {}) {
  const consent = {
    status: 'ACTIVE',
    experimentId: 'c2-s0-20260903',
    codeSha: CODE_SHA,
    evidenceManifestDigest: 'pending',
    attemptLedgerExactTxn: 6,
    approver: 'owner',
    approvedAt: '2026-09-05T12:00:00Z',
    ...overrides,
  };
  writeFileSync(path, `# ACTIVE\n\n\`\`\`yaml\n${Object.entries(consent).map(([k, v]) => `${k}: ${v == null ? 'null' : v}`).join('\n')}\n\`\`\`\n`);
  return consent;
}

function buildLiveRows(codeSha = CODE_SHA) {
  const common = {
    billingTier: 'S0',
    codeSha,
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
  return { common, rows };
}

function writeAttempts(path, count, codeSha = CODE_SHA) {
  const lines = [];
  for (let i = 1; i <= count; i += 1) {
    lines.push(JSON.stringify({
      codeSha, billingTier: 'S0', kind: 'image', attempt: i, cumulativeAttempts: i,
    }));
  }
  writeFileSync(path, `${lines.join('\n')}\n`);
}

function makePortalEvidence() {
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

  const { common, rows } = buildLiveRows('a'.repeat(40));
  const transactions = rows.reduce((sum, row) => sum + row.azureTxn, 0);
  rows.push({ ...common, kind: 'summary', transactions, projected: transactions, hardBudget: 2500 });
  writeFileSync(join(dir, 'runs', 'live.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  return dir;
}

/** Build exception evidence where one live file holds the full matrix and attempts match summary.txn. */
function makeExceptionFixture(options = {}) {
  const {
    decisionText = 'Verdict: Pending\nADR status: Proposed\n',
    activeStatus = 'ACTIVE',
    includeSecondRun = true,
    skipAttempts = false,
    badAttemptsJson = false,
    orphanAttempts = false,
    duplicateSummary = false,
    portalConflict = false,
    settledActualCost = null,
    monthlyUsageExactTxn = null,
    ownerOutOfPocketCostPln = 0,
    approver = 'owner',
    approvedAt = '2026-09-05T12:00:00Z',
    writeActiveFile = true,
  } = options;

  const dir = mkdtempSync(join(tmpdir(), 'nix-c2-s0-exc-'));
  mkdirSync(join(dir, 'runs'));
  const activePath = join(dir, 'ACTIVE.md');
  const bindingPath = join(dir, 'binding.json');

  writeFileSync(join(dir, 'latency-summary.json'), JSON.stringify({
    status: 'COMPLETE',
    workerBatchFitsLease: true,
  }));
  writeFileSync(join(dir, 'preflight.json'), JSON.stringify({ ok: true }));
  writeFileSync(join(dir, 'traffic-inputs.json'), JSON.stringify({ last30dText: 0 }));
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
  writeFileSync(join(dir, 'decision.md'), decisionText);
  writeFileSync(join(dir, 'resource-metadata.json'), JSON.stringify({ placeholder: true }));

  const { common, rows } = buildLiveRows(CODE_SHA);
  const matrixTxn = rows.reduce((sum, row) => sum + row.azureTxn, 0);
  const secondTxn = includeSecondRun ? 2 : 0;
  const totalTxn = matrixTxn + secondTxn;

  const rowsMain = [...rows];
  if (duplicateSummary) {
    rowsMain.push({ ...common, kind: 'summary', transactions: matrixTxn, projected: matrixTxn, hardBudget: 2500 });
  }
  rowsMain.push({ ...common, kind: 'summary', transactions: matrixTxn, projected: matrixTxn, hardBudget: 2500 });
  writeFileSync(join(dir, 'runs', 'live-main.jsonl'), `${rowsMain.map((row) => JSON.stringify(row)).join('\n')}\n`);
  if (!skipAttempts) {
    if (badAttemptsJson) {
      writeFileSync(join(dir, 'runs', 'live-main.jsonl.attempts'), '{not-json\n');
    } else {
      writeAttempts(join(dir, 'runs', 'live-main.jsonl.attempts'), matrixTxn);
    }
  }

  const paths = [
    'latency-summary.json',
    'preflight.json',
    'traffic-inputs.json',
    'traffic-forecast.json',
    'runs/live-main.jsonl',
    'runs/live-main.jsonl.attempts',
  ];

  if (includeSecondRun) {
    const rowsB = [
      { ...common, kind: 'image', sampleId: 'extra-1', decision: 'approved', maxSeverity: 0, azureTxn: 1 },
      { ...common, kind: 'image', sampleId: 'extra-2', decision: 'approved', maxSeverity: 0, azureTxn: 1 },
      { ...common, kind: 'summary', transactions: secondTxn, projected: secondTxn, hardBudget: 2500 },
    ];
    writeFileSync(join(dir, 'runs', 'live-extra.jsonl'), `${rowsB.map((row) => JSON.stringify(row)).join('\n')}\n`);
    writeAttempts(join(dir, 'runs', 'live-extra.jsonl.attempts'), secondTxn);
    paths.push('runs/live-extra.jsonl', 'runs/live-extra.jsonl.attempts');
  }

  if (orphanAttempts) {
    writeAttempts(join(dir, 'runs', 'live-orphan.jsonl.attempts'), 1);
  }

  if (skipAttempts) {
    // remove attempts from paths for binding when testing missing attempts — keep path listed so digest fails OR list without attempts
    const idx = paths.indexOf('runs/live-main.jsonl.attempts');
    if (idx >= 0) paths.splice(idx, 1);
  }

  const { digest } = computeEvidenceManifestDigest(dir, paths);
  assert.ok(digest);

  writeFileSync(bindingPath, JSON.stringify({
    experimentId: 'c2-s0-20260903',
    codeSha: CODE_SHA,
    evidenceManifestDigest: digest,
    attemptLedgerExactTxn: totalTxn,
    paths,
  }, null, 2));

  if (writeActiveFile) {
    writeActive(activePath, {
      status: activeStatus,
      evidenceManifestDigest: digest,
      attemptLedgerExactTxn: totalTxn,
      approver,
      approvedAt,
    });
  }

  const metadata = {
    region: 'Sweden Central',
    sku: 'S0',
    funding: 'promotional_credit',
    freeTrialActive: true,
    spendingLimitActive: true,
    creditBefore: 171.73,
    creditCurrency: 'EUR',
    creditExpiresAt: '2026-10-01',
    estimatedTestCostWith20pctBuffer: 10,
    usageConfirmationException: true,
    usageConfirmedInPortal: portalConflict ? true : false,
    monthlyUsageExactTxn,
    settledActualCost,
    ownerOutOfPocketCostPln,
    experimentId: 'c2-s0-20260903',
    codeSha: CODE_SHA,
    evidenceManifestDigest: digest,
    attemptLedgerExactTxn: totalTxn,
    billingOwner: 'subscription owner',
    verifiedAt: '2026-09-03T12:00:00Z',
  };
  if (portalConflict) {
    metadata.monthlyUsageExactTxn = 0;
  }
  writeFileSync(join(dir, 'resource-metadata.json'), JSON.stringify(metadata, null, 2));

  return { dir, activePath, bindingPath, digest, totalTxn, paths };
}

function validate(dir, { env = {}, bindingPath = null } = {}) {
  const args = [checker.pathname, '--require-complete-s0'];
  if (bindingPath) args.push('--s0-exception-binding', bindingPath);
  return spawnSync(process.execPath, args, {
    env: { ...process.env, SPIKE_EVIDENCE_DIR: dir, ...env },
    encoding: 'utf8',
  });
}

function validateException(fixture, extraEnv = {}) {
  return validate(fixture.dir, {
    bindingPath: fixture.bindingPath,
    env: {
      NIX_S0_PORTAL_EXCEPTION_ACTIVE: fixture.activePath,
      ...extraEnv,
    },
  });
}

test('complete S0 evidence requires promotional credit and spending limit', () => {
  const dir = makePortalEvidence();
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

test('exact Portal path still passes without exception fields', () => {
  const dir = makePortalEvidence();
  try {
    const result = validate(dir);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exception with INACTIVE consent fails', () => {
  const fixture = makeExceptionFixture({ activeStatus: 'INACTIVE' });
  try {
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ACTIVE status must be ACTIVE/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('exception without ACTIVE file fails', () => {
  const fixture = makeExceptionFixture({ writeActiveFile: false });
  try {
    const result = validate(fixture.dir, {
      bindingPath: fixture.bindingPath,
      env: {
        NIX_S0_PORTAL_EXCEPTION_ACTIVE: join(fixture.dir, 'missing-ACTIVE.md'),
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ACTIVE file missing/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('proposal ACTIVATED text is not consent', () => {
  const fixture = makeExceptionFixture({ writeActiveFile: false });
  const proposalPath = join(fixture.dir, 'proposal.md');
  writeFileSync(proposalPath, '# Proposal\n\nStatus: ACTIVATED\n\n```yaml\nstatus: INACTIVE\nexperimentId: c2-s0-20260903\n```\n');
  try {
    const result = validate(fixture.dir, {
      bindingPath: fixture.bindingPath,
      env: {
        NIX_S0_PORTAL_EXCEPTION_ACTIVE: proposalPath,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ACTIVE status must be ACTIVE/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('full exception + ACTIVE + digest + ledger passes usage but fails without Accepted', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Pending\nADR status: Proposed\n',
  });
  try {
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /decision\.md does not record Accepted/);
    assert.doesNotMatch(result.stderr, /Portal usage|ACTIVE status|evidenceManifestDigest mismatch|ledger/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('full exception with Accepted decision passes', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
  });
  try {
    const result = validateException(fixture);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('flip byte in live jsonl fails digest', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
  });
  try {
    appendFileSync(join(fixture.dir, 'runs', 'live-main.jsonl'), ' ');
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /evidenceManifestDigest mismatch/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('flip byte in attempts fails digest', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
  });
  try {
    appendFileSync(join(fixture.dir, 'runs', 'live-main.jsonl.attempts'), ' ');
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /evidenceManifestDigest mismatch/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('changing resource-metadata does not change digest', () => {
  const fixture = makeExceptionFixture();
  try {
    const before = computeEvidenceManifestDigest(fixture.dir, fixture.paths).digest;
    const metaPath = join(fixture.dir, 'resource-metadata.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    meta.billingOwner = 'changed-owner';
    writeFileSync(metaPath, JSON.stringify(meta));
    const after = computeEvidenceManifestDigest(fixture.dir, fixture.paths).digest;
    assert.equal(before, after);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('missing attempts file fails ledger', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
    skipAttempts: true,
  });
  try {
    // binding intentionally omits attempts path; recreate binding that still expects pairing via ledger on disk
    const paths = fixture.paths.filter((p) => !p.endsWith('.attempts'));
    // Ensure live-main has no attempts on disk (already), but binding digest without attempts path
    const { digest } = computeEvidenceManifestDigest(fixture.dir, paths);
    writeFileSync(fixture.bindingPath, JSON.stringify({
      experimentId: 'c2-s0-20260903',
      codeSha: CODE_SHA,
      evidenceManifestDigest: digest,
      attemptLedgerExactTxn: fixture.totalTxn,
      paths,
    }, null, 2));
    writeActive(fixture.activePath, {
      evidenceManifestDigest: digest,
      attemptLedgerExactTxn: fixture.totalTxn,
    });
    const meta = JSON.parse(readFileSync(join(fixture.dir, 'resource-metadata.json'), 'utf8'));
    meta.evidenceManifestDigest = digest;
    writeFileSync(join(fixture.dir, 'resource-metadata.json'), JSON.stringify(meta));

    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing attempts pairing/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('per-run summary mismatch fails ledger', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
  });
  try {
    writeAttempts(join(fixture.dir, 'runs', 'live-main.jsonl.attempts'), 1);
    // digest will also fail — recompute binding to isolate ledger... actually digest includes attempts content
    const { digest } = computeEvidenceManifestDigest(fixture.dir, fixture.paths);
    writeFileSync(fixture.bindingPath, JSON.stringify({
      experimentId: 'c2-s0-20260903',
      codeSha: CODE_SHA,
      evidenceManifestDigest: digest,
      attemptLedgerExactTxn: fixture.totalTxn,
      paths: fixture.paths,
    }, null, 2));
    writeActive(fixture.activePath, {
      evidenceManifestDigest: digest,
      attemptLedgerExactTxn: fixture.totalTxn,
    });
    const meta = JSON.parse(readFileSync(join(fixture.dir, 'resource-metadata.json'), 'utf8'));
    meta.evidenceManifestDigest = digest;
    writeFileSync(join(fixture.dir, 'resource-metadata.json'), JSON.stringify(meta));

    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /summary\.transactions .* !== attempts lines/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('invalid JSON in attempts fails', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
    badAttemptsJson: true,
  });
  try {
    const { digest } = computeEvidenceManifestDigest(fixture.dir, fixture.paths);
    writeFileSync(fixture.bindingPath, JSON.stringify({
      experimentId: 'c2-s0-20260903',
      codeSha: CODE_SHA,
      evidenceManifestDigest: digest,
      attemptLedgerExactTxn: fixture.totalTxn,
      paths: fixture.paths,
    }, null, 2));
    writeActive(fixture.activePath, {
      evidenceManifestDigest: digest,
      attemptLedgerExactTxn: fixture.totalTxn,
    });
    const meta = JSON.parse(readFileSync(join(fixture.dir, 'resource-metadata.json'), 'utf8'));
    meta.evidenceManifestDigest = digest;
    writeFileSync(join(fixture.dir, 'resource-metadata.json'), JSON.stringify(meta));

    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid JSON .*attempts/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('orphan attempts fail ledger', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
    orphanAttempts: true,
  });
  try {
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /orphan attempts/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('duplicate live summary fails ledger', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
    duplicateSummary: true,
  });
  try {
    const { digest } = computeEvidenceManifestDigest(fixture.dir, fixture.paths);
    writeFileSync(fixture.bindingPath, JSON.stringify({
      experimentId: 'c2-s0-20260903',
      codeSha: CODE_SHA,
      evidenceManifestDigest: digest,
      attemptLedgerExactTxn: fixture.totalTxn,
      paths: fixture.paths,
    }, null, 2));
    writeActive(fixture.activePath, {
      evidenceManifestDigest: digest,
      attemptLedgerExactTxn: fixture.totalTxn,
    });
    const meta = JSON.parse(readFileSync(join(fixture.dir, 'resource-metadata.json'), 'utf8'));
    meta.evidenceManifestDigest = digest;
    writeFileSync(join(fixture.dir, 'resource-metadata.json'), JSON.stringify(meta));

    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly one live non-dryRun summary/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('Portal true + exception true fails', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
    portalConflict: true,
  });
  try {
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbids usageConfirmedInPortal/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('settledActualCost 0 on exception path fails', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
    settledActualCost: 0,
  });
  try {
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /settledActualCost === null/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('monthlyUsageExactTxn set on exception path fails', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
    monthlyUsageExactTxn: 1937,
  });
  try {
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /monthlyUsageExactTxn === null/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('parseActiveConsent reads scalar yaml fence', () => {
  const parsed = parseActiveConsent('```yaml\nstatus: ACTIVE\napprover: "Ada"\nattemptLedgerExactTxn: 1937\n```\n');
  assert.equal(parsed.status, 'ACTIVE');
  assert.equal(parsed.approver, 'Ada');
  assert.equal(parsed.attemptLedgerExactTxn, 1937);
});

test('duplicate consent status fields fail', () => {
  assert.throws(
    () => parseActiveConsent('```yaml\nstatus: INACTIVE\nstatus: ACTIVE\napprover: Ada\n```\n'),
    /duplicate consent field: status/,
  );
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
  });
  try {
    writeFileSync(fixture.activePath, `# ACTIVE\n\n\`\`\`yaml\nstatus: INACTIVE\nstatus: ACTIVE\nexperimentId: c2-s0-20260903\ncodeSha: ${CODE_SHA}\nevidenceManifestDigest: ${fixture.digest}\nattemptLedgerExactTxn: ${fixture.totalTxn}\napprover: owner\napprovedAt: 2026-09-05T12:00:00Z\n\`\`\`\n`);
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /duplicate consent field: status/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('nonsense or non-UTC approvedAt fails', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
    approvedAt: 'yesterday-ish',
  });
  try {
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /approvedAt as ISO-8601 UTC/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('approvedAt without Z suffix fails', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
    approvedAt: '2026-09-05T12:00:00',
  });
  try {
    const result = validateException(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /approvedAt as ISO-8601 UTC/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('NIX_S0_PORTAL_EXCEPTION_BINDING env does not override CLI binding', () => {
  const fixture = makeExceptionFixture({
    decisionText: 'Verdict: Accepted\nADR status: Accepted\n',
  });
  const decoy = join(fixture.dir, 'decoy-binding.json');
  writeFileSync(decoy, JSON.stringify({
    experimentId: 'decoy',
    codeSha: 'b'.repeat(40),
    evidenceManifestDigest: '0'.repeat(64),
    attemptLedgerExactTxn: 1,
    paths: ['missing-on-purpose.json'],
  }));
  try {
    // Without argv override, committed binding is used; decoy env must be ignored.
    // Fixture evidence does not match committed 32-path digest → digest/path FAIL, not decoy experimentId.
    const result = validate(fixture.dir, {
      env: {
        NIX_S0_PORTAL_EXCEPTION_BINDING: decoy,
        NIX_S0_PORTAL_EXCEPTION_ACTIVE: fixture.activePath,
      },
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /metadata\.experimentId must match binding \(decoy\)/);
    assert.match(result.stderr, /manifest path missing|evidenceManifestDigest mismatch|metadata\.experimentId must match binding \(c2-s0-20260903\)/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('changing validation-summary and ops report does not change digest', () => {
  const fixture = makeExceptionFixture();
  try {
    const before = computeEvidenceManifestDigest(fixture.dir, fixture.paths).digest;
    writeFileSync(join(fixture.dir, 'validation-summary.json'), JSON.stringify({ mutated: true }));
    writeFileSync(join(fixture.dir, 'p0-3-s6-fake-report.md'), '# report mutated\n');
    const after = computeEvidenceManifestDigest(fixture.dir, fixture.paths).digest;
    assert.equal(before, after);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
