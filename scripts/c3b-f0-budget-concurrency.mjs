#!/usr/bin/env node
/**
 * Two-connection F0 budget race for the LAST free unit (local Postgres only).
 *
 * FORBIDDEN outside local Supabase (loopback:54322). Exit 2 = BLOCKED.
 * Creates an ephemeral database `c3b_conc_<uuid>`, bootstraps minimal F0 DDL,
 * runs the race there, and DROP DATABASE in finally — never mutates the
 * project app database ledger.
 *
 * Connection target is never passed as a raw URI to psql. Query-string
 * libpq overrides (host, hostaddr, service, …) are rejected.
 *
 * Usage: node scripts/c3b-f0-budget-concurrency.mjs
 * Exit 0 = PASS, 1 = FAIL, 2 = BLOCKED (non-local / unavailable).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOCAL_PORT = 54322;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DEFAULT_RAW = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ADMIN_DB = "postgres";
const BOOTSTRAP_SQL = join(
  dirname(fileURLToPath(import.meta.url)),
  "sql",
  "c3b_f0_concurrency_bootstrap.sql",
);

/** Forbidden libpq override tokens anywhere in the raw URL string. */
const FORBIDDEN_PARAM_RE = /(?:^|[?&#;])(?:host|hostaddr|service|options)=/i;

/**
 * Parse and approve a local admin connection target.
 * Database name from the URL is ignored (admin uses `postgres`; race uses ephemeral).
 * @param {string} raw
 * @returns {{ user: string, password: string, host: string, port: number }}
 */
export function parseApprovedLocalTarget(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("BLOCKED: non-local database (empty SUPABASE_DB_URL)");
  }
  if (FORBIDDEN_PARAM_RE.test(raw)) {
    throw new Error(
      "BLOCKED: non-local database (connection override params forbidden)",
    );
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("BLOCKED: non-local database (invalid SUPABASE_DB_URL)");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("BLOCKED: non-local database (unsupported protocol)");
  }
  if (parsed.search || (parsed.hash && parsed.hash.length > 0)) {
    throw new Error(
      "BLOCKED: non-local database (query/hash parameters forbidden)",
    );
  }

  const host = (parsed.hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!LOCAL_HOSTS.has(host) || port !== LOCAL_PORT) {
    throw new Error(
      `BLOCKED: non-local database (host=${host || "?"} port=${port}; require loopback:${LOCAL_PORT})`,
    );
  }

  const user = decodeURIComponent(parsed.username || "postgres") || "postgres";
  const password = decodeURIComponent(parsed.password || "postgres");

  return { user, password, host, port };
}

function exitBlocked(message) {
  console.error(message);
  process.exit(2);
}

function psqlEnv(password) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("PG")) {
      delete env[key];
    }
  }
  env.PGPASSWORD = password;
  return env;
}

/**
 * @param {{ user: string, password: string, host: string, port: number }} target
 * @param {string} database
 * @param {{ sql?: string, file?: string }} opts
 */
function runPsql(target, database, opts) {
  const args = [
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    target.host,
    "-p",
    String(target.port),
    "-U",
    target.user,
    "-d",
    database,
    "-At",
  ];
  if (opts.file) {
    args.push("-f", opts.file);
  } else if (opts.sql != null) {
    args.push("-c", opts.sql);
  } else {
    throw new Error("runPsql requires sql or file");
  }

  return new Promise((resolve) => {
    const child = spawn("psql", args, {
      env: psqlEnv(target.password),
      encoding: "utf8",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

function lastLine(c) {
  return c.stdout.trim().split("\n").filter(Boolean).pop() ?? "";
}

function isTrue(c) {
  const v = lastLine(c).toLowerCase();
  return c.status === 0 && (v === "t" || v === "true");
}

function isFalse(c) {
  const v = lastLine(c).toLowerCase();
  return c.status === 0 && (v === "f" || v === "false");
}

function quoteIdent(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`invalid database name: ${name}`);
  }
  return `"${name}"`;
}

async function main() {
  let target;
  try {
    target = parseApprovedLocalTarget(process.env.SUPABASE_DB_URL ?? DEFAULT_RAW);
  } catch (err) {
    exitBlocked(err instanceof Error ? err.message : String(err));
  }

  const ping = await runPsql(target, ADMIN_DB, { sql: "SELECT 1" });
  if (ping.status !== 0) {
    console.error("BLOCKED: local Postgres unavailable");
    console.error(ping.stderr || ping.stdout);
    process.exit(2);
  }

  const ephemeralDb = `c3b_conc_${randomUUID().replace(/-/g, "")}`;
  let racePassed = false;
  let exitCode = 1;

  try {
    const created = await runPsql(target, ADMIN_DB, {
      sql: `CREATE DATABASE ${quoteIdent(ephemeralDb)};`,
    });
    if (created.status !== 0) {
      console.error("FAIL: CREATE DATABASE", created.stderr || created.stdout);
      return 1;
    }

    const boot = await runPsql(target, ephemeralDb, { file: BOOTSTRAP_SQL });
    if (boot.status !== 0) {
      console.error("FAIL: bootstrap", boot.stderr || boot.stdout);
      return 1;
    }

    // Fresh ephemeral DB: one free unit (external_used=3999, hard_budget=4000).
    const setup = await runPsql(target, ephemeralDb, {
      sql: `
        SELECT private.ensure_moderation_f0_ledger(
          private.moderation_f0_month_key(),
          4000,
          3999
        );
        SELECT hard_budget - (external_used + reserved_txn + consumed_txn)
        FROM private.moderation_f0_ledger
        WHERE month_key = private.moderation_f0_month_key();
      `,
    });
    if (setup.status !== 0) {
      console.error("FAIL: setup", setup.stderr || setup.stdout);
      return 1;
    }
    const remaining = Number(lastLine(setup));
    if (remaining !== 1) {
      console.error(`FAIL: expected 1 remaining unit before race, got ${remaining}`);
      return 1;
    }

    const a1 = randomUUID();
    const a2 = randomUUID();
    const sql = (attempt) =>
      `SET ROLE service_role; SELECT (public.reserve_moderation_budget('image', 1, NULL, '${attempt}', 4000, NULL)->>'ok');`;

    const [childA, childB] = await Promise.all([
      runPsql(target, ephemeralDb, { sql: sql(a1) }),
      runPsql(target, ephemeralDb, { sql: sql(a2) }),
    ]);

    const okCount = [childA, childB].filter(isTrue).length;
    const failCount = [childA, childB].filter(isFalse).length;

    const ledger = await runPsql(target, ephemeralDb, {
      sql: `
        SELECT external_used + reserved_txn + consumed_txn
        FROM private.moderation_f0_ledger
        WHERE month_key = private.moderation_f0_month_key();
      `,
    });
    const used = Number(lastLine(ledger));

    if (okCount !== 1 || failCount !== 1 || used !== 4000) {
      console.error(
        `FAIL: expected exactly 1 ok / 1 fail and used=4000; got ok=${okCount} fail=${failCount} used=${used}`,
      );
      console.error("A", childA.stdout, childA.stderr);
      console.error("B", childB.stdout, childB.stderr);
      return 1;
    }

    racePassed = true;
    console.log(
      `PASS: ephemeral ${ephemeralDb} last-unit race → exactly 1 ok / 1 exhausted; used=4000`,
    );
    exitCode = 0;
  } finally {
    const dropped = await runPsql(target, ADMIN_DB, {
      sql: `DROP DATABASE IF EXISTS ${quoteIdent(ephemeralDb)} WITH (FORCE);`,
    });
    if (dropped.status !== 0) {
      console.error(
        "FAIL: DROP DATABASE cleanup",
        dropped.stderr || dropped.stdout,
      );
      if (racePassed) {
        exitCode = 1;
      }
    } else if (racePassed) {
      console.log(`CLEANUP: dropped ${ephemeralDb}`);
    }
  }

  return exitCode;
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .then((code) => process.exit(code ?? 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
