import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  azureImageTransactions,
  baselineTimestamps,
  contactSheetGrid,
  describeTimelineCoverage,
  scenePlusAnchorTimestamps,
  uniformCount,
  uniformSceneGuardTimestamps,
  uniformTimestamps,
} from "./moderation-video-sampling.ts";

Deno.test("baseline 1fps covers 15/60/180 seconds including start and last second", () => {
  const cases = [
    { duration: 14.9, frames: 15, last: 14 },
    { duration: 15, frames: 15, last: 14 },
    { duration: 15.402, frames: 16, last: 15 },
    { duration: 59.9, frames: 60, last: 59 },
    { duration: 60, frames: 60, last: 59 },
    { duration: 60.351, frames: 61, last: 60 },
    { duration: 179.9, frames: 180, last: 179 },
    { duration: 180, frames: 180, last: 179 },
  ];
  for (const testCase of cases) {
    const stamps = baselineTimestamps(testCase.duration);
    assertEquals(stamps.length, testCase.frames);
    assertEquals(stamps[0], 0);
    assertEquals(stamps.at(-1), testCase.last);
    const coverage = describeTimelineCoverage(
      stamps,
      testCase.duration,
      "baseline_1fps",
    );
    assertEquals(coverage.hasStart, true);
    assertEquals(coverage.hasMid, true);
    assertEquals(coverage.hasEnd, true);
    assertEquals(coverage.coverageClaim, "baseline_1fps_full_timeline");
  }
});

Deno.test("baseline caps at 180 and never claims full timeline above the supported duration", () => {
  const stamps = baselineTimestamps(180.1);
  assertEquals(stamps.length, 180);
  assertEquals(
    describeTimelineCoverage(stamps, 180.1, "baseline_1fps").coverageClaim,
    "sampled_timeline_not_a_full_video_scan",
  );
});

Deno.test("uniform counts follow 12/24/60 and still include start, mid, end", () => {
  assertEquals(uniformCount(15), 12);
  assertEquals(uniformCount(60), 24);
  assertEquals(uniformCount(180), 60);
  const stamps = uniformTimestamps(60);
  const coverage = describeTimelineCoverage(stamps, 60, "uniform");
  assertEquals(coverage.hasStart, true);
  assertEquals(coverage.hasMid, true);
  assertEquals(coverage.hasEnd, true);
  assertEquals(coverage.isBaselineFullTimeline, false);
  assertEquals(
    coverage.coverageClaim,
    "sampled_timeline_not_a_full_video_scan",
  );
});

Deno.test("scene strategy always keeps start/mid/end even with no scenes", () => {
  const stamps = scenePlusAnchorTimestamps(15, []);
  const coverage = describeTimelineCoverage(stamps, 15, "scene_plus_anchors");
  assertEquals(stamps.length, 3);
  assertEquals(coverage.hasStart, true);
  assertEquals(coverage.hasMid, true);
  assertEquals(coverage.hasEnd, true);
  assertEquals(
    coverage.coverageClaim,
    "sampled_timeline_not_a_full_video_scan",
  );
});

Deno.test("uniform scene guard samples before and after a detected cut", () => {
  const stamps = uniformSceneGuardTimestamps(14.92, [6.52]);
  assertEquals(stamps.includes(5.77), true);
  assertEquals(stamps.includes(6.27), true);
  assertEquals(stamps.includes(6.52), true);
  assertEquals(stamps.includes(6.77), true);
  const coverage = describeTimelineCoverage(
    stamps,
    14.92,
    "uniform_scene_guard",
  );
  assertEquals(
    coverage.coverageClaim,
    "sampled_timeline_not_a_full_video_scan",
  );
});

Deno.test("uniform scene guard clips boundaries, sorts, and deduplicates", () => {
  const stamps = uniformSceneGuardTimestamps(15, [0, 0.1, 14.95, 15]);
  assertEquals(stamps[0], 0);
  assertEquals(stamps.at(-1), 14.95);
  assertEquals(
    stamps.every((value, index) => index === 0 || value > stamps[index - 1]),
    true,
  );
});

Deno.test("uniform scene guard without cuts equals uniform", () => {
  assertEquals(uniformSceneGuardTimestamps(60, []), uniformTimestamps(60));
});

Deno.test("uniform scene guard rejects more than 120 unique frames", () => {
  const cuts = Array.from({ length: 40 }, (_, index) => 1 + index * 4);
  assertThrows(
    () => uniformSceneGuardTimestamps(180, cuts),
    Error,
    "excessive_scene_changes",
  );
});

Deno.test("guard windows intersect all off-anchor fixture intervals", () => {
  const fixtures = [
    { duration: 14.92, cut: 6.52, unsafeStart: 5.5, unsafeEnd: 6.5 },
    { duration: 59.96, cut: 23.2, unsafeStart: 22.2, unsafeEnd: 23.2 },
    { duration: 179.96, cut: 67.6, unsafeStart: 66.6, unsafeEnd: 67.6 },
  ];
  for (const fixture of fixtures) {
    const stamps = uniformSceneGuardTimestamps(fixture.duration, [fixture.cut]);
    assertEquals(
      stamps.some((time) =>
        time >= fixture.unsafeStart && time <= fixture.unsafeEnd
      ),
      true,
    );
  }
});

Deno.test("contact sheet is one Azure image transaction", () => {
  assertEquals(azureImageTransactions("contact_sheet", 12), 1);
  assertEquals(azureImageTransactions("baseline_1fps", 180), 180);
  assertEquals(azureImageTransactions("uniform", 24), 24);
});

Deno.test("baseline coverage claim is the only full-timeline label", () => {
  const coverage = describeTimelineCoverage(
    baselineTimestamps(15),
    15,
    "baseline_1fps",
  );
  assertEquals(coverage.isBaselineFullTimeline, true);
  assertEquals(coverage.coverageClaim, "baseline_1fps_full_timeline");
});

Deno.test("overshoot 15.402/60.351 uniform never gets baseline label even with dense frames", () => {
  const overshoot15 = uniformTimestamps(15.402);
  const coverage15 = describeTimelineCoverage(overshoot15, 15.402, "uniform");
  assertEquals(
    coverage15.coverageClaim,
    "sampled_timeline_not_a_full_video_scan",
  );
  assertEquals(coverage15.isBaselineFullTimeline, false);

  const overshoot60 = uniformTimestamps(60.351);
  const coverage60 = describeTimelineCoverage(overshoot60, 60.351, "uniform");
  assertEquals(
    coverage60.coverageClaim,
    "sampled_timeline_not_a_full_video_scan",
  );
  assertEquals(coverage60.isBaselineFullTimeline, false);

  // Same dense stamps with baseline strategy still claim full timeline when length matches.
  const baselineLike = baselineTimestamps(15.402);
  const baselineCoverage = describeTimelineCoverage(
    baselineLike,
    15.402,
    "baseline_1fps",
  );
  assertEquals(baselineCoverage.coverageClaim, "baseline_1fps_full_timeline");
});

Deno.test("contact_sheet and scene never claim baseline full timeline", () => {
  const stamps = uniformTimestamps(15);
  assertEquals(
    describeTimelineCoverage(stamps, 15, "contact_sheet").coverageClaim,
    "sampled_timeline_not_a_full_video_scan",
  );
  assertEquals(
    describeTimelineCoverage(stamps, 15, "scene_plus_anchors").coverageClaim,
    "sampled_timeline_not_a_full_video_scan",
  );
});

Deno.test("contact sheet grid fits all frames without claiming extra Azure calls", () => {
  assertEquals(contactSheetGrid(12), { cols: 4, rows: 3 });
  assertEquals(contactSheetGrid(24), { cols: 5, rows: 5 });
  assertEquals(contactSheetGrid(60), { cols: 8, rows: 8 });
});
