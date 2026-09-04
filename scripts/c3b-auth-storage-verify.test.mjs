import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOST_DB_PORT,
  PATH_B_TIP,
  runAuthStorageVerify,
  splitCurlHttp,
} from "./c3b-auth-storage-verify.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

function ok(stdout = "", stderr = "") {
  return { status: 0, stdout, stderr };
}

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

function teardownOkHandlers() {
  return [
    { match: "docker rm", result: ok() },
    { match: "docker network rm", result: ok() },
    { match: "docker volume rm", result: ok() },
    { match: "docker ps", result: ok("") },
    { match: "docker network ls", result: ok("") },
    { match: "docker volume ls", result: ok("") },
  ];
}

function teardownFailHandlers() {
  return [
    { match: "docker rm", result: { status: 1, stdout: "", stderr: "busy" } },
    { match: "docker network rm", result: ok() },
    { match: "docker volume rm", result: ok() },
    { match: "docker ps", result: ok("still\n") },
    { match: "docker network ls", result: ok("") },
    { match: "docker volume ls", result: ok("") },
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

describe("splitCurlHttp", () => {
  it("splits body and status", () => {
    const r = splitCurlHttp('{"id":"x"}\n200');
    assert.equal(r.status, 200);
    assert.equal(r.body, '{"id":"x"}');
  });
});

describe("runAuthStorageVerify orchestration (injected run)", () => {
  it("network create fail → exit 2, teardown still invoked for empty stack", async () => {
    const { run, calls } = createRecordingRun([
      {
        match: (cmd, args) =>
          cmd === "docker" && args[0] === "network" && args[1] === "create",
        result: { status: 1, stdout: "", stderr: "net fail" },
      },
      ...teardownOkHandlers(),
    ]);
    const code = await runAuthStorageVerify({ run, path: "A" });
    assert.equal(code, 2);
    assert.equal(migrationApplyCalls(calls).length, 0);
    assert.ok(
      calls.some((c) => c.key.includes("enable_ip_masquerade=false")),
      "must request no-masquerade network",
    );
  });

  it("egress fail after db start → zero APPLY, stack teardown runs, exit 2", async () => {
    const { run, calls } = createRecordingRun([
      {
        match: (cmd, args) =>
          cmd === "docker" && args[0] === "network" && args[1] === "create",
        result: ok("net\n"),
      },
      {
        match: (cmd, args) => cmd === "docker" && args[0] === "volume" && args[1] === "create",
        result: ok("vol\n"),
      },
      {
        match: (cmd, args) =>
          cmd === "docker" &&
          args[0] === "run" &&
          args.some((a) => String(a).includes(String(HOST_DB_PORT))),
        result: ok("db\n"),
      },
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("service_role") && key.includes("storage"),
        result: ok("t\n"),
      },
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("supabase_auth_admin"),
        result: ok(),
      },
      // subsequent docker runs (auth/storage/peer/kong) fail early via unhandled → exit 2 before APPLY
      // force inspect failure after passwords to keep path short:
      {
        match: (cmd, args) =>
          cmd === "docker" && args[0] === "run" && !args.some((a) => String(a).includes(String(HOST_DB_PORT))),
        result: { status: 1, stdout: "", stderr: "auth boom" },
      },
      ...teardownOkHandlers(),
    ]);

    const code = await runAuthStorageVerify({ run, path: "A" });
    assert.equal(code, 2);
    assert.equal(migrationApplyCalls(calls).length, 0);
    assert.ok(calls.some((c) => c.key.includes("docker rm")));
    assert.ok(calls.some((c) => c.key.includes("docker volume rm")));
  });

  it("isolation fail + teardown fail → final exit 1", async () => {
    const { run } = createRecordingRun([
      {
        match: (cmd, args) =>
          cmd === "docker" && args[0] === "network" && args[1] === "create",
        result: ok("net\n"),
      },
      {
        match: (cmd, args) => cmd === "docker" && args[0] === "volume" && args[1] === "create",
        result: ok("vol\n"),
      },
      {
        match: (cmd, args) =>
          cmd === "docker" &&
          args[0] === "run" &&
          args.some((a) => String(a).includes(String(HOST_DB_PORT))),
        result: ok("db\n"),
      },
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("service_role") && key.includes("storage"),
        result: ok("t\n"),
      },
      {
        match: (cmd, args, key) =>
          cmd === "psql" && key.includes("supabase_auth_admin"),
        result: ok(),
      },
      {
        match: (cmd, args) =>
          cmd === "docker" &&
          args[0] === "run" &&
          !args.some((a) => String(a).includes(String(HOST_DB_PORT))),
        result: { status: 1, stdout: "", stderr: "auth boom" },
      },
      ...teardownFailHandlers(),
    ]);

    const code = await runAuthStorageVerify({ run, path: "A" });
    assert.equal(code, 1);
  });

  it("Path B tip constant is pinned pre-C3B audit migration", () => {
    assert.equal(PATH_B_TIP, "20260831150000_pre_delivery_moderation_f0_budget.sql");
  });
});
