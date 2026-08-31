export function parseCleanupDryRun(body: unknown, header: string | null): boolean {
  if (header === 'true' || header === '1') return true;
  if (body && typeof body === 'object' && 'dryRun' in body) {
    return Boolean((body as { dryRun?: unknown }).dryRun);
  }
  return false;
}

export type EvidenceOrphan = {
  object_name: string;
  created_at: string;
  eligible: boolean;
};

export function summarizeEvidenceOrphans(rows: EvidenceOrphan[]) {
  const eligibleNames: string[] = [];
  for (const row of rows) {
    if (row.eligible) eligibleNames.push(row.object_name);
  }
  return {
    orphanCount: rows.length,
    eligibleOrphanCount: eligibleNames.length,
    skippedYoungOrphanCount: rows.length - eligibleNames.length,
    eligibleNames,
  };
}
