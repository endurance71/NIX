import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  azureImageTransactions,
  baselineTimestamps,
  contactSheetGrid,
  describeTimelineCoverage,
  scenePlusAnchorTimestamps,
  uniformCount,
  uniformTimestamps,
} from './moderation-video-sampling.ts';

Deno.test('baseline 1fps covers 15/60/180 seconds including start and last second', () => {
  assertEquals(baselineTimestamps(15).length, 15);
  assertEquals(baselineTimestamps(15)[0], 0);
  assertEquals(baselineTimestamps(15).at(-1), 14);
  assertEquals(baselineTimestamps(60).length, 60);
  assertEquals(baselineTimestamps(180).length, 180);
});

Deno.test('uniform counts follow 12/24/60 and still include start, mid, end', () => {
  assertEquals(uniformCount(15), 12);
  assertEquals(uniformCount(60), 24);
  assertEquals(uniformCount(180), 60);
  const stamps = uniformTimestamps(60);
  const coverage = describeTimelineCoverage(stamps, 60);
  assertEquals(coverage.hasStart, true);
  assertEquals(coverage.hasMid, true);
  assertEquals(coverage.hasEnd, true);
  assertEquals(coverage.isBaselineFullTimeline, false);
  assertEquals(coverage.coverageClaim, 'sampled_timeline_not_a_full_video_scan');
});

Deno.test('scene strategy always keeps start/mid/end even with no scenes', () => {
  const stamps = scenePlusAnchorTimestamps(15, []);
  const coverage = describeTimelineCoverage(stamps, 15);
  assertEquals(stamps.length, 3);
  assertEquals(coverage.hasStart, true);
  assertEquals(coverage.hasMid, true);
  assertEquals(coverage.hasEnd, true);
});

Deno.test('contact sheet is one Azure image transaction', () => {
  assertEquals(azureImageTransactions('contact_sheet', 12), 1);
  assertEquals(azureImageTransactions('baseline_1fps', 180), 180);
  assertEquals(azureImageTransactions('uniform', 24), 24);
});

Deno.test('baseline coverage claim is the only full-timeline label', () => {
  const coverage = describeTimelineCoverage(baselineTimestamps(15), 15);
  assertEquals(coverage.isBaselineFullTimeline, true);
  assertEquals(coverage.coverageClaim, 'baseline_1fps_full_timeline');
});

Deno.test('contact sheet grid fits all frames without claiming extra Azure calls', () => {
  assertEquals(contactSheetGrid(12), { cols: 4, rows: 3 });
  assertEquals(contactSheetGrid(24), { cols: 5, rows: 5 });
  assertEquals(contactSheetGrid(60), { cols: 8, rows: 8 });
});
