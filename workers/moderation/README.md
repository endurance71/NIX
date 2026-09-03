# C3A: isolated OVH video runtime experiment

Status: C3A offline benchmark PASS (2026-09-03), experimental, offline only. No production entry point, credentials,
Azure SDK, database connection or feature flag. ADR-001 is not changed.

`core.ts` provides a single-flight, one-job loop (claim 1, lease 900 seconds,
processing timeout 600 seconds). Completion must succeed before materialization;
processing failures become `error`, never `approved`, without automatic retries.
`rpc-queue.ts` is an injected adapter for the existing claim/complete/materialize
RPC names and parameters. C3A tests it with a fake RPC, not a production database.
It is not wired into the existing HTTP function: that function and its uncommitted
changes are deliberately untouched. Downloading, text/image dispatch, rejected
media cleanup and production scheduling remain behind the separate C3B gate.

`video.ts` reuses the existing hybrid sampler and scene parser. It validates
100 MiB / 180 second limits, plans all timestamps before the first provider call,
rejects over 120 frames, and extracts/processes/removes one JPEG at a time.
The final anchor uses the last decoded frame to handle low-frame-rate videos.
ffmpeg output is bounded, subprocesses are killed and reaped on cancellation,
and temporary frame files are removed in `finally`. Provider implementations
must honor AbortSignal to cancel any underlying I/O; awaiting a stalled provider
is also bounded by the job signal. All coverage remains sampled, not a full scan.

## Offline verification

With Deno 2.9.6 and ffmpeg installed:

```sh
deno test --no-config --allow-read --allow-write --allow-run workers/moderation
```

Build only a staged context containing `workers/moderation` and the three shared
modules referenced by Dockerfile. Never send the repository root (or `.env`,
historical fixtures, keys, user files) as a remote build context. Deno image is
digest-pinned and ffmpeg package version is pinned. Transitive Debian packages
are resolved at build time; record the resulting image ID with evidence.

The Docker image generates safe synthetic media locally. `ovh-benchmark.py`
requires an already built `nix-c3a-offline:local` image and Docker access. It takes
60 seconds of host baseline, applies 1 CPU / 1 GiB / no additional swap /
128 PIDs / readonly filesystem / 512 MiB tmpfs / unprivileged user / no network,
ports or mounts. It removes its own container and tmpfs in `finally`.
Stop conditions: OOM, restart, host available memory below 1 GiB, load > 4 for
30 seconds, or total benchmark deadline 900 seconds. Do not raise limits.

Cases: safe 15/60/180 seconds, three 180-second runs, frequent safe cuts,
excessive cuts, corrupt input, exactly 100 MiB and 100 MiB + 1 byte. Large-size
fixtures use zero padding of a small valid MP4; they test the size boundary,
not worst-case high-bitrate/4K decoding. Fake provider delay is 200 ms/frame.
No benchmark result establishes harmful-content recall or Azure latency/SLA.

Save only sanitized JSONL and numeric summaries outside Git under
`~/.nix-ops/p0-3-worker-runtime/`. Remove the staged remote build context and
test image after collecting evidence. Do not prune unrelated Docker resources.

## Separate C3B gate — not implemented or authorized by this experiment

- Finish Azure billing reconciliation; preserve existing C2 evidence and ADR gate.
- Integrate shared core with HTTP/text/image paths and streamed bounded downloads;
  verify all existing materialization/quarantine contracts in staging.
- Add a durable atomic F0 budget ledger (4000 operational ceiling), rate limiting,
  explicit retry accounting, lease-expiry enforcement and idempotent recovery.
- Implement monitoring, scheduled worker supervision, shutdown and rollback.
- Validate realistic resolutions/codecs and end-to-end staging SLA before enabling
  a production flag; no production migration/flag change during C3A.
- Promotional trial expiry must not trigger a Pay-As-You-Go upgrade.

Container limit semantics: https://docs.docker.com/engine/containers/resource_constraints/

## Recorded C3A result

Benchmark source: `a4ad3f7a5668edeb37d58eb62e7959cadacff750`.
10/10 cases passed; zero Azure requests, no OOM/restart. Maximum **sampled** RAM
49.71 MiB, minimum host available RAM 3.848 GiB, maximum host load1 1.196.
Three 180-second runs: 21.737 / 22.122 / 22.256 seconds with the fake provider.
Container/media removed. This supports bounded runtime feasibility, not a
production performance guarantee or a change to the C2/ADR acceptance gate.
Use `node workers/moderation/summarize-evidence.mjs <sanitized-jsonl>` to validate
and summarize the external evidence. Historical benchmark results are immutable.
