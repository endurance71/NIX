/** Offline S0 portal-exception helpers (digest, ACTIVE consent, attempt ledger). */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_BINDING_PATH = fileURLToPath(
  new URL('./s0-portal-exception-binding.json', import.meta.url),
);

export function defaultActivePath() {
  return join(process.env.HOME || '', '.nix-ops', 'p0-3-s6', 'S0-PORTAL-EXCEPTION-ACTIVE.md');
}

export function loadBinding(bindingPath = process.env.NIX_S0_PORTAL_EXCEPTION_BINDING || DEFAULT_BINDING_PATH) {
  const binding = JSON.parse(readFileSync(bindingPath, 'utf8'));
  if (!binding.experimentId || !binding.codeSha || !binding.evidenceManifestDigest
    || !Number.isInteger(binding.attemptLedgerExactTxn) || !Array.isArray(binding.paths)) {
    throw new Error('invalid S0 portal exception binding');
  }
  return binding;
}

export function computeEvidenceManifestDigest(evidenceDir, paths) {
  const sorted = [...paths].sort();
  const lines = [];
  for (const rel of sorted) {
    const abs = join(evidenceDir, rel);
    if (!existsSync(abs)) {
      return { digest: null, error: `manifest path missing: ${rel}` };
    }
    const hex = createHash('sha256').update(readFileSync(abs)).digest('hex');
    lines.push(`${rel}\0${hex}\n`);
  }
  const digest = createHash('sha256').update(lines.join(''), 'utf8').digest('hex');
  return { digest, error: null };
}

/** Parse YAML-like fenced block from ACTIVE markdown (scalar keys only). */
export function parseActiveConsent(markdown) {
  const fence = markdown.match(/```(?:ya?ml)?\s*\n([\s\S]*?)```/);
  const body = fence ? fence[1] : markdown;
  const out = {};
  let skipMultiline = false;
  for (const rawLine of body.split(/\n/)) {
    const line = rawLine.replace(/\r$/, '');
    if (skipMultiline) {
      if (/^[A-Za-z][A-Za-z0-9_]*\s*:/.test(line)) skipMultiline = false;
      else continue;
    }
    const m = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest === '|' || rest === '>') {
      skipMultiline = true;
      out[key] = '';
      continue;
    }
    let value = rest.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === 'null') out[key] = null;
    else if (/^-?\d+$/.test(value)) out[key] = Number(value);
    else out[key] = value;
  }
  return out;
}

export function readActiveConsent(activePath) {
  if (!activePath || !existsSync(activePath)) {
    return { ok: false, error: 'S0 portal exception ACTIVE file missing', consent: null };
  }
  try {
    const consent = parseActiveConsent(readFileSync(activePath, 'utf8'));
    return { ok: true, error: null, consent };
  } catch (error) {
    return { ok: false, error: `invalid ACTIVE consent: ${error.message}`, consent: null };
  }
}

function countAttemptsLines(attemptsPath, failures, rel) {
  if (!existsSync(attemptsPath)) return null;
  const lines = readFileSync(attemptsPath, 'utf8').split(/\n/).filter((line) => line.trim());
  for (const [index, line] of lines.entries()) {
    try {
      JSON.parse(line);
    } catch (error) {
      failures.push(`invalid JSON ${rel}.attempts:${index + 1}: ${error.message}`);
    }
  }
  return lines.length;
}

/**
 * Reconcile live-*.jsonl with sibling .attempts files.
 * @returns {{ summaryTxnSum: number, attemptsLinesSum: number, failures: string[] }}
 */
export function reconcileAttemptLedger(evidenceDir, attemptLedgerExactTxn) {
  const failures = [];
  const runsDir = join(evidenceDir, 'runs');
  if (!existsSync(runsDir)) {
    failures.push('missing runs/ for attempt ledger');
    return { summaryTxnSum: 0, attemptsLinesSum: 0, failures };
  }

  const names = readdirSync(runsDir);
  const liveJsonl = names.filter((name) => /^live-.*\.jsonl$/.test(name) && !name.endsWith('.attempts'));
  const attemptFiles = new Set(names.filter((name) => name.endsWith('.jsonl.attempts')));

  let summaryTxnSum = 0;
  let attemptsLinesSum = 0;

  for (const name of liveJsonl.sort()) {
    const rel = `runs/${name}`;
    const abs = join(runsDir, name);
    const attemptsName = `${name}.attempts`;
    const attemptsRel = `runs/${attemptsName}`;
    attemptFiles.delete(attemptsName);

    if (!existsSync(join(runsDir, attemptsName))) {
      failures.push(`missing attempts pairing for ${rel}`);
      continue;
    }

    const fileRows = [];
    for (const [index, line] of readFileSync(abs, 'utf8').split(/\n/).entries()) {
      if (!line.trim()) continue;
      try {
        fileRows.push(JSON.parse(line));
      } catch (error) {
        failures.push(`invalid JSONL ${rel}:${index + 1}: ${error.message}`);
      }
    }
    const summaries = fileRows.filter((row) => row.kind === 'summary' && row.dryRun !== true);
    if (summaries.length !== 1) {
      failures.push(`${rel} must contain exactly one live non-dryRun summary for ledger`);
      continue;
    }
    const txn = summaries[0].transactions;
    if (!Number.isInteger(txn) || txn < 0) {
      failures.push(`${rel} summary.transactions must be a non-negative integer`);
      continue;
    }
    const attemptCount = countAttemptsLines(join(runsDir, attemptsName), failures, rel);
    if (attemptCount == null) continue;
    if (txn !== attemptCount) {
      failures.push(`${rel} summary.transactions (${txn}) !== attempts lines (${attemptCount})`);
    }
    summaryTxnSum += txn;
    attemptsLinesSum += attemptCount;
  }

  for (const orphan of [...attemptFiles].sort()) {
    const base = orphan.replace(/\.attempts$/, '');
    if (!/^live-.*\.jsonl$/.test(base)) continue;
    if (!existsSync(join(runsDir, base))) {
      failures.push(`orphan attempts without jsonl: runs/${orphan}`);
    }
  }

  if (summaryTxnSum !== attemptsLinesSum) {
    failures.push(`ledger global mismatch summaries ${summaryTxnSum} !== attempts ${attemptsLinesSum}`);
  }
  if (summaryTxnSum !== attemptLedgerExactTxn) {
    failures.push(
      `ledger total ${summaryTxnSum} !== attemptLedgerExactTxn ${attemptLedgerExactTxn}`,
    );
  }

  return { summaryTxnSum, attemptsLinesSum, failures };
}

export function validateExceptionConsentAndBinding({
  metadata,
  binding,
  activePath,
  evidenceDir,
}) {
  const failures = [];

  if (metadata.usageConfirmedInPortal === true) {
    failures.push('exception path forbids usageConfirmedInPortal === true');
  }
  if (metadata.usageConfirmedInPortal !== false) {
    failures.push('exception path requires usageConfirmedInPortal === false');
  }
  if (metadata.monthlyUsageExactTxn !== null) {
    failures.push('exception path requires monthlyUsageExactTxn === null');
  }
  if (metadata.settledActualCost !== null) {
    failures.push('exception path requires settledActualCost === null');
  }
  if (metadata.ownerOutOfPocketCostPln !== 0) {
    failures.push('exception path requires ownerOutOfPocketCostPln === 0');
  }

  const active = readActiveConsent(activePath);
  if (!active.ok) {
    failures.push(active.error);
    return failures;
  }
  const consent = active.consent;
  if (consent.status !== 'ACTIVE') {
    failures.push('S0 portal exception ACTIVE status must be ACTIVE (INACTIVE or missing is not consent)');
  }
  if (typeof consent.approver !== 'string' || !consent.approver.trim()) {
    failures.push('S0 portal exception ACTIVE requires approver');
  }
  if (typeof consent.approvedAt !== 'string' || !consent.approvedAt.trim()) {
    failures.push('S0 portal exception ACTIVE requires approvedAt');
  }

  const fields = ['experimentId', 'codeSha', 'evidenceManifestDigest'];
  for (const field of fields) {
    if (metadata[field] !== binding[field]) {
      failures.push(`metadata.${field} must match binding (${binding[field]})`);
    }
    if (consent[field] !== binding[field]) {
      failures.push(`ACTIVE.${field} must match binding (${binding[field]})`);
    }
  }
  if (metadata.attemptLedgerExactTxn !== binding.attemptLedgerExactTxn) {
    failures.push(`metadata.attemptLedgerExactTxn must be ${binding.attemptLedgerExactTxn}`);
  }
  if (consent.attemptLedgerExactTxn !== binding.attemptLedgerExactTxn) {
    failures.push(`ACTIVE.attemptLedgerExactTxn must be ${binding.attemptLedgerExactTxn}`);
  }

  const { digest, error } = computeEvidenceManifestDigest(evidenceDir, binding.paths);
  if (error) failures.push(error);
  else if (digest !== binding.evidenceManifestDigest) {
    failures.push(
      `evidenceManifestDigest mismatch: recomputed ${digest} !== binding ${binding.evidenceManifestDigest}`,
    );
  } else if (metadata.evidenceManifestDigest !== digest || consent.evidenceManifestDigest !== digest) {
    failures.push('evidenceManifestDigest must match recomputed digest in metadata and ACTIVE');
  }

  const ledger = reconcileAttemptLedger(evidenceDir, binding.attemptLedgerExactTxn);
  failures.push(...ledger.failures);

  return failures;
}

