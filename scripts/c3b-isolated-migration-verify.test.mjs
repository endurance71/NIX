import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runIsolatedMigrationVerify } from "./c3b-isolated-migration-verify.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

/**
 * Recording stub for the real runner's `run` injection.
 * Handlers match first-wins; prefer specific patterns before catch-alls.
 */
function createRecordingRun(handlers) {
  const calls = [];
  const run = async (cmd, args = [], opts) => {
    const key = `${cmd} ${args.join(" ")}`;
    calls.push({ cmd, args: [...args], key, opts });
    for (const h of handlers) {
      if (typeof h.match === "function" ? h.match(cmd, args, key) : key.includes(h.match)) {
        return typeof h.result === "function" ? h.result(cmd, args, opts) : h.result;
      }
    }
    return { status: 1, stdout: "", stderr: `unhandled stub: ${key}` };
  };
  return { run, calls };
}

function ok(stdout = "", stderr = "") {
  return { status: 0, stdout, stderr };
}

/** Shared stubs up through container start + postgres ready. */
function baseStackHandlers() {
  return [
    {
      match: (cmd, args) => cmd === "docker" && args[0] === "inspect",
      result: ok(""),
    },
    {
      match: (cmd, args) =>
        cmd === "docker" && args[0] === "network" && args[1] === "create",
      result: ok("net-id\n"),
    },
    {
      match: (cmd, args) => cmd === "docker" && args[0] === "run",
      result: ok("ctr-id\n"),
    },
    {
      match: (cmd, args, key) =>
        cmd === "psql" && key.includes("service_role") && key.includes("storage"),
      result: ok("t\n"),
    },
  ];
}

/** Successful IPv4 egress lock with IPv6 disabled (skips ip6tables path). */
function egressBlockOkHandlers() {
  return [
    {
      match: (cmd, args, key) =>
        cmd === "docker" &&
        args.includes("exec") &&
        key.includes("apk add") &&
        key.includes("iptables"),
      result: ok(),
    },
    {
      match: (cmd, args, key) =>
        cmd === "docker" &&
        args.includes("exec") &&
        key.includes("command -v iptables") &&
        !key.includes("ip6tables") &&
        !key.includes("iptables -"),
      result: ok("/sbin/iptables\n"),
    },
    {
      match: (cmd, args, key) =>
        cmd === "docker" && args.includes("exec") && key.includes("iptables -P OUTPUT DROP"),
      result: ok("Chain OUTPUT\n"),
    },
    {
      match: (cmd, args, key) =>
        cmd === "docker" && args.includes("exec") && key.includes("IPV6_ON"),
      result: ok("IPV6_OFF\n"),
    },
  ];
}

/** verifyEgress fails because public IPv4 is reachable (EXIT:0). */
function probePublicReachableHandlers() {
  return [
    {
      match: (cmd, args, key) =>
        cmd === "docker" &&
        args.includes("exec") &&
        key.includes("TOOLS_") &&
        !key.includes("IPV6"),
      result: ok("TOOLS_OK\n"),
    },
    {
      match: (cmd, args, key) =>
        cmd === "docker" && args.includes("exec") && key.includes("1.1.1.1"),
      result: ok("EXIT:0\n"),
    },
  ];
}

/** blockEgress fails early (no iptables). */
function egressBlockFailHandlers() {
  return [
    {
      match: (cmd, args, key) =>
        cmd === "docker" &&
        args.includes("exec") &&
        (key.includes("apk add") || key.includes("command -v iptables")),
      result: { status: 1, stdout: "", stderr: "no iptables" },
    },
  ];
}

function teardownOkHandlers() {
  return [
    { match: "docker rm", result: ok() },
    { match: "docker network rm", result: ok() },
    { match: "docker ps", result: ok("") },
    { match: "docker network ls", result: ok("") },
  ];
}

function teardownFailHandlers() {
  return [
    { match: "docker rm", result: { status: 1, stdout: "", stderr: "busy" } },
    { match: "docker network rm", result: ok() },
    { match: "docker ps", result: ok("still\n") },
    { match: "docker network ls", result: ok("") },
  ];
}

function migrationApplyCalls(calls) {
  return calls.filter(
    (c) =>
      c.cmd === "psql" &&
      c.args.includes("-f") &&
      c.args.some((a) => a.includes(MIGRATIONS_DIR) || /\/migrations\/.+\.sql$/.test(a)),
  );
}

function teardownCalls(calls) {
  return calls.filter(
    (c) =>
      c.key.includes("docker rm") ||
      c.key.includes("docker network rm") ||
      c.key.includes("docker ps") ||
      c.key.includes("docker network ls"),
  );
}

describe("runIsolatedMigrationVerify orchestration (injected run)", () => {
  it("verifyEgress fail → zero migration APPLY, teardown runs, exit 2", async () => {
    const { run, calls } = createRecordingRun([
      ...baseStackHandlers(),
      ...egressBlockOkHandlers(),
      ...probePublicReachableHandlers(),
      ...teardownOkHandlers(),
    ]);

    const code = await runIsolatedMigrationVerify({ run });

    assert.equal(code, 2);
    assert.equal(migrationApplyCalls(calls).length, 0, "must not APPLY migrations");
    assert.ok(teardownCalls(calls).length > 0, "performTeardown must run");
    assert.ok(
      calls.some((c) => c.key.includes("docker rm")),
      "container rm expected",
    );
  });

  it("blockEgress fail → zero migration APPLY, teardown runs, exit 2", async () => {
    const { run, calls } = createRecordingRun([
      ...baseStackHandlers(),
      ...egressBlockFailHandlers(),
      ...teardownOkHandlers(),
    ]);

    const code = await runIsolatedMigrationVerify({ run });

    assert.equal(code, 2);
    assert.equal(migrationApplyCalls(calls).length, 0);
    assert.ok(teardownCalls(calls).length > 0);
  });

  it("isolation fail + teardown fail → final exit 1 (overrides BLOCKED=2)", async () => {
    const { run, calls } = createRecordingRun([
      ...baseStackHandlers(),
      ...egressBlockOkHandlers(),
      ...probePublicReachableHandlers(),
      ...teardownFailHandlers(),
    ]);

    const code = await runIsolatedMigrationVerify({ run });

    assert.equal(code, 1);
    assert.equal(migrationApplyCalls(calls).length, 0);
    assert.ok(calls.some((c) => c.key.includes("docker rm")));
  });

  it("happy-path stub reaches APPLY then PASS without live Docker", async () => {
    const { run, calls } = createRecordingRun([
      ...baseStackHandlers(),
      ...egressBlockOkHandlers(),
      // verifyEgress success: tools ok, public blocked, loopback ok
      {
        match: (cmd, args, key) =>
          cmd === "docker" &&
          args.includes("exec") &&
          key.includes("TOOLS_") &&
          !key.includes("IPV6"),
        result: ok("TOOLS_OK\n"),
      },
      {
        match: (cmd, args, key) =>
          cmd === "docker" && args.includes("exec") && key.includes("1.1.1.1"),
        result: ok("EXIT:1\n"),
      },
      {
        match: (cmd, args, key) =>
          cmd === "docker" &&
          args.includes("exec") &&
          key.includes("127.0.0.1") &&
          key.includes("SELECT 1"),
        result: ok("EXIT:0\n"),
      },
      // post-probe SQL / docker exec stubs
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("CREATE EXTENSION IF NOT EXISTS pg_cron"),
        result: ok(),
      },
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("extname = 'pg_cron'"),
        result: ok("pg_cron\n"),
      },
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("CREATE ROLE anon"),
        result: ok(),
      },
      {
        match: (cmd, args, key) =>
          cmd === "docker" &&
          args.includes("exec") &&
          key.includes("supabase_admin") &&
          key.includes("storage.buckets"),
        result: ok(),
      },
      {
        match: (cmd, args, key) =>
          cmd === "docker" &&
          args.includes("exec") &&
          key.includes("supabase_admin") &&
          key.includes("email_confirmed_at"),
        result: ok(),
      },
      {
        match: (cmd, args) => cmd === "psql" && args.includes("-f"),
        result: ok("ok 1\n"),
      },
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("reserve_moderation_budget"),
        result: ok("1\n"),
      },
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("c3b_isolated_run"),
        result: ok(),
      },
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("pgtap"),
        result: ok(),
      },
      {
        match: (cmd, args) =>
          cmd === "node" &&
          args.some((a) => a.includes("c3b-f0-budget-concurrency.mjs")),
        result: ok("RACE_OK\n"),
      },
      ...teardownOkHandlers(),
    ]);

    const code = await runIsolatedMigrationVerify({ run });

    assert.equal(code, 0);
    assert.ok(
      migrationApplyCalls(calls).length > 0,
      "happy path must APPLY migrations via psql -f",
    );
    assert.ok(teardownCalls(calls).length > 0);
  });
});
