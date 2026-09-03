import { readFileSync } from "node:fs";

const rows = readFileSync(process.argv[2], "utf8").trim().split("\n").map(
  JSON.parse,
);
const cases = rows.filter((r) => r.phase === "case").map((r) => r.result);
const samples = rows.filter((r) => r.phase === "sample");
const baseline = rows.filter((r) => r.phase === "baseline");
const ids = [
  "safe15",
  "safe60",
  "safe180a",
  "safe180b",
  "safe180c",
  "cuts15",
  "excessive60",
  "boundary100MiB",
  "over100MiB",
  "corrupt",
];
function requireEvidence(condition) {
  if (!condition) throw new Error("incomplete_or_failed_evidence");
}
requireEvidence(baseline.length === 30 && samples.length > 0);
requireEvidence(
  cases.length === ids.length && ids.every((id, i) => cases[i].caseId === id),
);
requireEvidence(
  cases.every((c) =>
    c.pass === true && c.azureRequests === 0 && c.elapsedMs < 600000
  ),
);
requireEvidence(
  rows.some((r) =>
    r.phase === "completed" && r.exitCode === 0 && !r.oom && r.restarts === 0
  ),
);
requireEvidence(
  rows.some((r) =>
    r.phase === "cleanup" && r.containerRemoved && r.temporaryMediaRemoved
  ),
);
requireEvidence(
  samples.every((r) =>
    r.availableBytes >= 1024 ** 3 && r.tmpBytes <= 512 * 1024 ** 2
  ),
);
function memoryMiB(text) {
  const [, number, unit] = text.match(/^([\d.]+)([KMG]iB) /) ?? [];
  if (!unit) throw new Error("invalid_memory_unit");
  return Number(number) * ({ KiB: 1 / 1024, MiB: 1, GiB: 1024 }[unit]);
}
const times = cases.filter((c) => /^safe180[abc]$/.test(c.caseId)).map((c) =>
  c.elapsedMs
).sort((a, b) => a - b);
requireEvidence(times.length === 3);
console.log(JSON.stringify(
  {
    status: "offline_runtime_pass",
    azureRequests: 0,
    caseCount: cases.length,
    baselineSeconds: 60,
    sampleCount: samples.length,
    maxSampledCpuPercentOfOneCore: Math.max(
      ...samples.map((r) => r.cpuPercent),
    ),
    maxSampledMemoryMiB: Math.max(...samples.map((r) => memoryMiB(r.memory))),
    maxSampledTmpMiB: Math.max(...samples.map((r) => r.tmpBytes)) / 1024 ** 2,
    minHostAvailableGiB: Math.min(...samples.map((r) => r.availableBytes)) /
      1024 ** 3,
    maxHostLoad1: Math.max(...samples.map((r) => r.load1)),
    latency180Ms: times,
    p95NearestRankMs: times[2],
    fakeProviderDelayMs: 200,
    provesAzureSla: false,
    provesHarmfulRecall: false,
    containerAndTemporaryMediaRemoved: true,
  },
  null,
  2,
));
