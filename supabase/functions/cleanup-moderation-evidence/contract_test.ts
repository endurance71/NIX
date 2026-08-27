import { assertEquals } from 'jsr:@std/assert@1';
import { parseCleanupDryRun, summarizeEvidenceOrphans } from './contract.ts';

Deno.test('parses dry-run from JSON body or header', () => {
  assertEquals(parseCleanupDryRun(undefined, null), false);
  assertEquals(parseCleanupDryRun({ dryRun: true }, null), true);
  assertEquals(parseCleanupDryRun({}, 'true'), true);
  assertEquals(parseCleanupDryRun({ dryRun: false }, '1'), true);
});

Deno.test('summarizes eligible orphans older than 24 hours', () => {
  assertEquals(
    summarizeEvidenceOrphans([
      { object_name: 'old/evidence.json', created_at: '2026-07-01T00:00:00Z', eligible: true },
      { object_name: 'young/evidence.json', created_at: '2026-08-26T00:00:00Z', eligible: false },
    ]),
    {
      orphanCount: 2,
      eligibleOrphanCount: 1,
      skippedYoungOrphanCount: 1,
      eligibleNames: ['old/evidence.json'],
    }
  );
});
