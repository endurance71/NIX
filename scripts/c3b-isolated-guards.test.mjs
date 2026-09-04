import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertGone,
  blockEgress,
  decideIpv6Lock,
  finalExitCode,
  interpretLoopbackProbe,
  interpretPublicProbe,
  LOOPBACK_TCP_PROBE_SCRIPT,
  performTeardown,
  runProbeGatePhase,
  verifyEgress,
} from "./lib/c3b-isolated-guards.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = join(dirname(fileURLToPath(import.meta.url)), "c3b-isolated-migration-verify.mjs");
const HARNESS = join(dirname(fileURLToPath(import.meta.url)), "c3b-f0-budget-concurrency.mjs");

function stubRun(handlers) {
  return async (cmd, args) => {
    const key = `${cmd} ${args.join(" ")}`;
    for (const h of handlers) {
      if (typeof h.match === "function" ? h.match(cmd, args, key) : key.includes(h.match)) {
        return typeof h.result === "function" ? h.result(cmd, args) : h.result;
      }
    }
    return { status: 1, stdout: "", stderr: `unhandled stub: ${key}` };
  };
}

describe("decideIpv6Lock", () => {
  it("allows when IPv6 disabled", () => {
    const d = decideIpv6Lock({
      ipv6Enabled: false,
      hasIp6tables: false,
      applyStatus: null,
      listStatus: null,
    });
    assert.equal(d.ok, true);
    assert.equal(d.mode, "IPV6_DISABLED_OK");
  });

  it("fails when IPv6 up but ip6tables missing", () => {
    const d = decideIpv6Lock({
      ipv6Enabled: true,
      hasIp6tables: false,
      applyStatus: 0,
      listStatus: 0,
    });
    assert.equal(d.ok, false);
    assert.match(d.detail, /ip6tables missing/);
  });

  it("fails when ip6tables apply fails", () => {
    const d = decideIpv6Lock({
      ipv6Enabled: true,
      hasIp6tables: true,
      applyStatus: 1,
      listStatus: 0,
    });
    assert.equal(d.ok, false);
  });
});

describe("interpretPublicProbe", () => {
  it("probe_unavailable when tools missing", () => {
    const r = interpretPublicProbe({
      toolsPresent: false,
      execStatus: 0,
      stdout: "EXIT:1",
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "probe_unavailable");
  });

  it("probe_infra_fail when EXIT marker missing", () => {
    const r = interpretPublicProbe({
      toolsPresent: true,
      execStatus: 0,
      stdout: "docker exploded",
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "probe_infra_fail");
  });

  it("public_reachable when EXIT:0", () => {
    const r = interpretPublicProbe({
      toolsPresent: true,
      execStatus: 0,
      stdout: "EXIT:0",
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "public_reachable");
  });

  it("public_blocked when EXIT:nonzero and exec ok", () => {
    const r = interpretPublicProbe({
      toolsPresent: true,
      execStatus: 0,
      stdout: "EXIT:1",
    });
    assert.equal(r.ok, true);
    assert.equal(r.reason, "public_blocked");
  });

  it("EXIT:127 is probe_unavailable not public_blocked", () => {
    const r = interpretPublicProbe({
      toolsPresent: true,
      execStatus: 0,
      stdout: "EXIT:127",
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "probe_unavailable");
  });

  it("EXIT:126 is probe_unavailable", () => {
    const r = interpretPublicProbe({
      toolsPresent: true,
      execStatus: 0,
      stdout: "EXIT:126",
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "probe_unavailable");
  });

  it("execStatus:1 with EXIT:1 is probe_infra_fail not public_blocked", () => {
    const r = interpretPublicProbe({
      toolsPresent: true,
      execStatus: 1,
      stdout: "EXIT:1",
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "probe_infra_fail");
  });
});

describe("interpretLoopbackProbe", () => {
  it("requires EXIT marker and success", () => {
    assert.equal(
      interpretLoopbackProbe({ execStatus: 0, stdout: "EXIT:0" }).ok,
      true,
    );
    assert.equal(
      interpretLoopbackProbe({ execStatus: 0, stdout: "nope" }).reason,
      "probe_infra_fail",
    );
  });

  it("execStatus:1 with EXIT:0 is probe_infra_fail not loopback_ok", () => {
    const r = interpretLoopbackProbe({ execStatus: 1, stdout: "EXIT:0" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "probe_infra_fail");
  });
});

describe("finalExitCode", () => {
  it("teardown fail overrides PASS and BLOCKED", () => {
    assert.equal(finalExitCode(0, false), 1);
    assert.equal(finalExitCode(2, false), 1);
    assert.equal(finalExitCode(0, true), 0);
    assert.equal(finalExitCode(2, true), 2);
  });
});

describe("assertGone with stubs", () => {
  it("TEARDOWN_FAIL when docker ps errors (empty stdout is not gone)", async () => {
    const run = stubRun([
      { match: "docker ps", result: { status: 1, stdout: "", stderr: "cannot talk to daemon" } },
    ]);
    const err = await assertGone(run, { container: "c3b-mig-x", network: "" });
    assert.match(err, /cannot_verify container/);
  });

  it("reports still present when id listed", async () => {
    const run = stubRun([
      { match: "docker ps", result: { status: 0, stdout: "abc123\n", stderr: "" } },
    ]);
    const err = await assertGone(run, { container: "c3b-mig-x", network: "" });
    assert.match(err, /still present/);
  });
});

describe("blockEgress with stubs", () => {
  it("fails when IPv6 enabled and ip6tables missing", async () => {
    const run = stubRun([
      {
        match: (cmd, args) => args.join(" ").includes("apk add"),
        result: { status: 0, stdout: "", stderr: "" },
      },
      {
        match: (cmd, args) =>
          args.join(" ") === "exec ctr sh -c command -v iptables",
        result: { status: 0, stdout: "/sbin/iptables\n", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("iptables -P OUTPUT DROP"),
        result: { status: 0, stdout: "Chain OUTPUT\n", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("if_inet6"),
        result: { status: 0, stdout: "IPV6_ON\n", stderr: "" },
      },
      {
        match: (cmd, args) =>
          args.join(" ").includes("command -v ip6tables") &&
          !args.join(" ").includes("apk"),
        result: { status: 1, stdout: "", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("ip6tables -"),
        result: { status: 2, stdout: "", stderr: "ip6tables missing" },
      },
    ]);
    const r = await blockEgress(run, "ctr");
    assert.equal(r.ok, false);
    assert.match(r.detail, /ip6tables/i);
  });

  it("IPV6_DISABLED_OK when stack off", async () => {
    const run = stubRun([
      { match: "apk add", result: { status: 0, stdout: "", stderr: "" } },
      { match: "command -v iptables", result: { status: 0, stdout: "/sbin/iptables\n", stderr: "" } },
      {
        match: (cmd, args) => args.join(" ").includes("iptables -P OUTPUT DROP"),
        result: { status: 0, stdout: "Chain OUTPUT\n", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("if_inet6") || args.join(" ").includes("IPV6"),
        result: { status: 0, stdout: "IPV6_OFF\n", stderr: "" },
      },
    ]);
    const r = await blockEgress(run, "ctr");
    assert.equal(r.ok, true);
    assert.equal(r.ipv6Mode, "IPV6_DISABLED_OK");
  });
});

describe("verifyEgress with stubs", () => {
  it("probe_unavailable when no wget/nc", async () => {
    const run = stubRun([
      {
        match: (cmd, args) => args.join(" ").includes("TOOLS_"),
        result: { status: 0, stdout: "TOOLS_MISSING\n", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("1.1.1.1"),
        result: { status: 0, stdout: "EXIT:1\n", stderr: "" },
      },
    ]);
    const r = await verifyEgress(run, "ctr", { ipv6Enabled: false });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "probe_unavailable");
  });

  it("probe_infra_fail when docker exec has no EXIT marker", async () => {
    const run = stubRun([
      {
        match: (cmd, args) => args.join(" ").includes("TOOLS_") && !args.join(" ").includes("IPV6"),
        result: { status: 0, stdout: "TOOLS_OK\n", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("1.1.1.1"),
        result: { status: 1, stdout: "", stderr: "exec failed" },
      },
    ]);
    const r = await verifyEgress(run, "ctr", { ipv6Enabled: false });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "probe_infra_fail");
  });

  it("IPv6 enabled without IPv6 tools is probe_unavailable", async () => {
    const run = stubRun([
      {
        match: (cmd, args) =>
          args.join(" ").includes("TOOLS_") && !args.join(" ").includes("IPV6"),
        result: { status: 0, stdout: "TOOLS_OK\n", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("1.1.1.1"),
        result: { status: 0, stdout: "EXIT:1\n", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("IPV6_TOOLS"),
        result: { status: 0, stdout: "IPV6_TOOLS_MISSING\n", stderr: "" },
      },
    ]);
    const r = await verifyEgress(run, "ctr", { ipv6Enabled: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "probe_unavailable");
  });
});

describe("runProbeGatePhase", () => {
  it("failed probe skips migrations, runs cleanup, exit 2", async () => {
    let migrations = 0;
    const run = stubRun([
      {
        match: (cmd, args) =>
          args.join(" ").includes("TOOLS_") && !args.join(" ").includes("IPV6"),
        result: { status: 0, stdout: "TOOLS_OK\n", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("1.1.1.1"),
        result: { status: 0, stdout: "EXIT:127\n", stderr: "" },
      },
      { match: "docker rm", result: { status: 0, stdout: "", stderr: "" } },
      { match: "docker network rm", result: { status: 0, stdout: "", stderr: "" } },
      { match: "docker ps", result: { status: 0, stdout: "", stderr: "" } },
      { match: "docker network ls", result: { status: 0, stdout: "", stderr: "" } },
    ]);
    const phase = await runProbeGatePhase({
      run,
      container: "c3b-mig-x",
      network: "c3b-mig-net-x",
      ipv6Enabled: false,
      applyMigrations: () => {
        migrations += 1;
      },
    });
    assert.equal(phase.probe.ok, false);
    assert.equal(phase.migrationsRun, false);
    assert.equal(migrations, 0);
    assert.equal(phase.teardownOk, true);
    assert.equal(phase.exitCode, 2);
  });

  it("failed probe + teardown fail → exit 1", async () => {
    const run = stubRun([
      {
        match: (cmd, args) =>
          args.join(" ").includes("TOOLS_") && !args.join(" ").includes("IPV6"),
        result: { status: 0, stdout: "TOOLS_OK\n", stderr: "" },
      },
      {
        match: (cmd, args) => args.join(" ").includes("1.1.1.1"),
        result: { status: 0, stdout: "EXIT:127\n", stderr: "" },
      },
      { match: "docker rm", result: { status: 1, stdout: "", stderr: "busy" } },
      { match: "docker network rm", result: { status: 0, stdout: "", stderr: "" } },
      { match: "docker ps", result: { status: 0, stdout: "still\n", stderr: "" } },
      { match: "docker network ls", result: { status: 0, stdout: "", stderr: "" } },
    ]);
    const phase = await runProbeGatePhase({
      run,
      container: "c3b-mig-x",
      network: "c3b-mig-net-x",
      ipv6Enabled: false,
    });
    assert.equal(phase.migrationsRun, false);
    assert.equal(phase.teardownOk, false);
    assert.equal(phase.exitCode, 1);
  });
});

describe("performTeardown", () => {
  it("teardown fail after PASS → final exit 1", async () => {
    const run = stubRun([
      { match: "docker rm", result: { status: 1, stdout: "", stderr: "busy" } },
      { match: "docker network rm", result: { status: 0, stdout: "", stderr: "" } },
      { match: "docker ps", result: { status: 0, stdout: "stillhere\n", stderr: "" } },
      { match: "docker network ls", result: { status: 0, stdout: "", stderr: "" } },
    ]);
    const { teardownOk } = await performTeardown(run, {
      started: true,
      networkCreated: true,
      container: "c3b-mig-x",
      network: "c3b-mig-net-x",
    });
    assert.equal(teardownOk, false);
    assert.equal(finalExitCode(0, teardownOk), 1);
  });
});

describe("runner contracts", () => {
  it("egress fail path appears before APPLY migrations", () => {
    const src = readFileSync(RUNNER, "utf8");
    const egressIdx = src.indexOf("blockEgress");
    const applyIdx = src.indexOf("APPLY ${f}");
    assert.ok(egressIdx > 0);
    assert.ok(applyIdx > egressIdx, "migrations must not run before egress lock");
    assert.match(src, /finalExitCode/);
    assert.match(src, /tryExit/);
    assert.doesNotMatch(
      src,
      /return 2;\s*\n\s*}\s*\n\s*networkCreated/,
      "early return 2 must not bypass finalExitCode path",
    );
  });

  it("loopback probe uses explicit TCP 127.0.0.1", () => {
    assert.match(LOOPBACK_TCP_PROBE_SCRIPT, /-h 127\.0\.0\.1/);
    assert.doesNotMatch(
      LOOPBACK_TCP_PROBE_SCRIPT,
      /psql -U postgres -d postgres -At/,
    );
  });

  it("DIRECT requires C3B_ISOLATED_RUN_ID sentinel check", () => {
    const src = readFileSync(HARNESS, "utf8");
    assert.match(src, /C3B_ISOLATED_RUN_ID/);
    assert.match(src, /private\.c3b_isolated_run/);
    assert.match(
      src,
      /BLOCKED: C3B_CONC_DIRECT=1 requires C3B_ISOLATED_RUN_ID/,
    );
  });
});
