#!/usr/bin/env node
/**
 * Two-connection F0 budget race for the LAST free unit (local Postgres only).
 *
 * FORBIDDEN outside local loopback. Exit 2 = BLOCKED.
 * Creates an ephemeral database `c3b_conc_<uuid>`, never mutates the project
 * app-database ledger, and never CREATE ROLE / GRANT membership (cluster-wide).
 * Never terminates foreign Postgres backends (no session killing).
 *
 * Modes:
 * - default: apply scripts/sql/c3b_f0_concurrency_bootstrap.sql (DDL only)
 * - C3B_CONC_USE_TEMPLATE=1: CREATE DATABASE … TEMPLATE postgres (migrated schema);
 *   if source is busy → exit 2 BLOCKED (without terminating other sessions)
 * - C3B_CONC_FORCE_FAIL=1: fail after create/bootstrap; still DROP + role snapshot check
 * - C3B_CONC_DIRECT=1: race on admin DB `postgres` (isolated :15432 / authstore :15532);
 *   no CREATE/DROP DATABASE (container is disposable)
 *
 * Connection target is never passed as a raw URI to psql.
 *
 * Usage: node scripts/c3b-f0-budget-concurrency.mjs
 * Exit 0 = PASS, 1 = FAIL, 2 = BLOCKED (non-local / unavailable / missing roles / busy template).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSafePsqlEnv } from "./lib/safe-psql-env.mjs";

const ALLOWED_LOCAL_PORTS = new Set([54322, 15432, 15532]);
const DIRECT_PORTS = new Set([15432, 15532]);
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const ADMIN_DB = "postgres";
const BOOTSTRAP_SQL = join(
  dirname(fileURLToPath(import.meta.url)),
  "sql",
  "c3b_f0_concurrency_bootstrap.sql",
);

function resolveAllowedPort() {
  const raw = process.env.C3B_CONC_ALLOW_PORT;
  const port = raw ? Number(raw) : 54322;
  if (!Number.isInteger(port) || !ALLOWED_LOCAL_PORTS.has(port)) {
    throw new Error(
      `BLOCKED: C3B_CONC_ALLOW_PORT must be one of ${[...ALLOWED_LOCAL_PORTS].join(",")}`,
    );
  }
  return port;
}

function defaultRawUrl(port) {
  return `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
}

/** Forbidden libpq override tokens anywhere in the raw URL string. */
const FORBIDDEN_PARAM_RE = /(?:^|[?&#;])(?:host|hostaddr|service|options)=/i;

const ROLE_SNAPSHOT_SQL = `
SELECT string_agg(line, E'\\n' ORDER BY line)
FROM (
  SELECT format(
    'role:%s oid=%s login=%s bypassrls=%s',
    rolname, oid, rolcanlogin, rolbypassrls
  ) AS line
  FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role')
  UNION ALL
  SELECT format('member:%s->%s', m.rolname, r.rolname) AS line
  FROM pg_auth_members am
  JOIN pg_roles r ON r.oid = am.roleid
  JOIN pg_roles m ON m.oid = am.member
  WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
     OR m.rolname IN ('anon', 'authenticated', 'service_role')
) s;
`.trim();

const PREFLIGHT_SQL = `
SELECT
  (SELECT COUNT(*)::int FROM pg_roles
   WHERE rolname IN ('anon', 'authenticated', 'service_role')) AS role_count,
  pg_has_role(current_user, 'service_role', 'member') AS can_set_service_role;
`.trim();

/**
 * Parse and approve a local admin connection target.
 * Database name from the URL is ignored (admin uses `postgres`; race uses ephemeral).
 * @param {string} raw
 * @param {{ allowedPort?: number }} [opts]
 * @returns {{ user: string, password: string, host: string, port: number }}
 */
export function parseApprovedLocalTarget(raw, opts = {}) {
  const allowedPort = opts.allowedPort ?? resolveAllowedPort();
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
  if (!LOCAL_HOSTS.has(host) || port !== allowedPort) {
    throw new Error(
      `BLOCKED: non-local database (host=${host || "?"} port=${port}; require loopback:${allowedPort})`,
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
      env: buildSafePsqlEnv(target.password),
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

function fullStdout(c) {
  return c.stdout.replace(/\r/g, "").trim();
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

async function snapshotRoles(target) {
  const r = await runPsql(target, ADMIN_DB, { sql: ROLE_SNAPSHOT_SQL });
  if (r.status !== 0) {
    throw new Error(`role snapshot failed: ${r.stderr || r.stdout}`);
  }
  return fullStdout(r);
}

async function assertNoLeftoverConcDb(target) {
  const r = await runPsql(target, ADMIN_DB, {
    sql: `SELECT COALESCE(string_agg(datname, ',' ORDER BY datname), '') FROM pg_database WHERE datname LIKE 'c3b_conc_%';`,
  });
  if (r.status !== 0) {
    throw new Error(`leftover check failed: ${r.stderr || r.stdout}`);
  }
  const left = lastLine(r);
  if (left) {
    throw new Error(`leftover c3b_conc databases: ${left}`);
  }
}

async function main() {
  let allowedPort;
  try {
    allowedPort = resolveAllowedPort();
  } catch (err) {
    exitBlocked(err instanceof Error ? err.message : String(err));
  }

  let target;
  try {
    target = parseApprovedLocalTarget(
      process.env.SUPABASE_DB_URL ?? defaultRawUrl(allowedPort),
      { allowedPort },
    );
  } catch (err) {
    exitBlocked(err instanceof Error ? err.message : String(err));
  }

  const useTemplate = process.env.C3B_CONC_USE_TEMPLATE === "1";
  const forceFail = process.env.C3B_CONC_FORCE_FAIL === "1";
  const useDirect = process.env.C3B_CONC_DIRECT === "1";
  if (useDirect && !DIRECT_PORTS.has(allowedPort)) {
    exitBlocked(
      "BLOCKED: C3B_CONC_DIRECT=1 only allowed with C3B_CONC_ALLOW_PORT=15432|15532",
    );
  }
  if (useDirect && useTemplate) {
    exitBlocked("BLOCKED: C3B_CONC_DIRECT=1 and C3B_CONC_USE_TEMPLATE=1 are mutually exclusive");
  }

  const ping = await runPsql(target, ADMIN_DB, { sql: "SELECT 1" });
  if (ping.status !== 0) {
    console.error("BLOCKED: local Postgres unavailable");
    console.error(ping.stderr || ping.stdout);
    process.exit(2);
  }

  const pre = await runPsql(target, ADMIN_DB, { sql: PREFLIGHT_SQL });
  if (pre.status !== 0) {
    exitBlocked(`BLOCKED: role preflight query failed: ${pre.stderr || pre.stdout}`);
  }
  const [roleCountRaw, canSetRaw] = fullStdout(pre).split("|");
  const roleCount = Number(roleCountRaw);
  const canSet = String(canSetRaw).toLowerCase() === "t";
  if (roleCount !== 3 || !canSet) {
    exitBlocked(
      `BLOCKED: required roles missing or current_user cannot SET ROLE service_role (role_count=${roleCount} can_set=${canSet})`,
    );
  }

  let snapBefore;
  try {
    snapBefore = await snapshotRoles(target);
  } catch (err) {
    exitBlocked(err instanceof Error ? err.message : String(err));
  }
  console.log("ROLE_SNAPSHOT_BEFORE_OK");

  if (useTemplate) {
    const fn = await runPsql(target, ADMIN_DB, {
      sql: `SELECT COUNT(*)::int FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'reserve_moderation_budget';`,
    });
    if (fn.status !== 0 || Number(lastLine(fn)) < 1) {
      exitBlocked(
        "BLOCKED: C3B_CONC_USE_TEMPLATE=1 requires reserve_moderation_budget on postgres (run migrations / db reset first)",
      );
    }
  }
  if (useDirect) {
    const runId = process.env.C3B_ISOLATED_RUN_ID?.trim() ?? "";
    if (!/^[a-z0-9-]{8,64}$/i.test(runId)) {
      exitBlocked(
        "BLOCKED: C3B_CONC_DIRECT=1 requires C3B_ISOLATED_RUN_ID matching isolated sentinel",
      );
    }
    const fn = await runPsql(target, ADMIN_DB, {
      sql: `SELECT COUNT(*)::int FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'reserve_moderation_budget';`,
    });
    if (fn.status !== 0 || Number(lastLine(fn)) < 1) {
      exitBlocked(
        "BLOCKED: C3B_CONC_DIRECT=1 requires reserve_moderation_budget on migrated isolated DB",
      );
    }
    const sent = await runPsql(target, ADMIN_DB, {
      sql: `SELECT COUNT(*)::int FROM private.c3b_isolated_run WHERE run_id = '${runId.replace(/'/g, "")}'`,
    });
    if (sent.status !== 0 || Number(lastLine(sent)) !== 1) {
      exitBlocked(
        "BLOCKED: C3B_ISOLATED_RUN_ID does not match private.c3b_isolated_run sentinel (not the disposable stack)",
      );
    }
    console.log(`ISOLATED_RUN_ID_OK ${runId}`);
  }

  const ephemeralDb = useDirect
    ? ADMIN_DB
    : `c3b_conc_${randomUUID().replace(/-/g, "")}`;
  let exitCode = 1;
  let dbCreated = false;
  let readyForRace = false;

  try {
    if (useDirect) {
      readyForRace = true;
      console.log("DIRECT_RACE_ON_ADMIN_DB (isolated stack)");
    } else if (useTemplate) {
      const created = await runPsql(target, ADMIN_DB, {
        sql: `CREATE DATABASE ${quoteIdent(ephemeralDb)} TEMPLATE postgres;`,
      });
      if (created.status !== 0) {
        console.error(
          "BLOCKED: template source database busy (no session terminate)",
        );
        console.error(created.stderr || created.stdout);
        exitCode = 2;
      } else {
        dbCreated = true;
        readyForRace = true;
        console.log(`CREATED_TEMPLATE ${ephemeralDb}`);
      }
    } else {
      const created = await runPsql(target, ADMIN_DB, {
        sql: `CREATE DATABASE ${quoteIdent(ephemeralDb)};`,
      });
      if (created.status !== 0) {
        console.error("FAIL: CREATE DATABASE", created.stderr || created.stdout);
        exitCode = 1;
      } else {
        dbCreated = true;
        const boot = await runPsql(target, ephemeralDb, { file: BOOTSTRAP_SQL });
        if (boot.status !== 0) {
          console.error("FAIL: bootstrap", boot.stderr || boot.stdout);
          exitCode = 1;
        } else {
          readyForRace = true;
          console.log(`CREATED_BOOTSTRAP ${ephemeralDb}`);
        }
      }
    }

    if (readyForRace && forceFail) {
      console.error("FAIL: C3B_CONC_FORCE_FAIL=1 (controlled failure before race)");
      exitCode = 1;
    } else if (readyForRace) {
      exitCode = await runLastUnitRace(target, ephemeralDb, {
        useTemplate,
        useDirect,
      });
    }
  } finally {
    if (dbCreated) {
      const dropped = await runPsql(target, ADMIN_DB, {
        sql: `DROP DATABASE IF EXISTS ${quoteIdent(ephemeralDb)} WITH (FORCE);`,
      });
      if (dropped.status !== 0) {
        console.error(
          "FAIL: DROP DATABASE cleanup",
          dropped.stderr || dropped.stdout,
        );
        if (exitCode === 0 || exitCode === 2) exitCode = 1;
      } else {
        console.log(`CLEANUP: dropped ${ephemeralDb}`);
      }
    } else if (!useDirect) {
      await runPsql(target, ADMIN_DB, {
        sql: `DROP DATABASE IF EXISTS ${quoteIdent(ephemeralDb)} WITH (FORCE);`,
      });
    } else {
      console.log("CLEANUP: skipped DROP (direct race on disposable isolated postgres)");
    }

    try {
      const snapAfter = await snapshotRoles(target);
      if (snapAfter !== snapBefore) {
        console.error("FAIL: cluster role/membership snapshot changed");
        console.error("BEFORE\n" + snapBefore);
        console.error("AFTER\n" + snapAfter);
        if (exitCode === 0 || exitCode === 2) exitCode = 1;
      } else {
        console.log("ROLE_SNAPSHOT_UNCHANGED");
      }
      await assertNoLeftoverConcDb(target);
      console.log("NO_LEFTOVER_C3B_CONC_DB");
    } catch (err) {
      console.error("FAIL:", err instanceof Error ? err.message : String(err));
      if (exitCode === 0 || exitCode === 2) exitCode = 1;
    }
  }

  return exitCode;
}

/**
 * @param {{ user: string, password: string, host: string, port: number }} target
 * @param {string} ephemeralDb
 * @param {{ useTemplate: boolean, useDirect: boolean }} modes
 * @returns {Promise<number>} 0 PASS, 1 FAIL
 */
async function runLastUnitRace(target, ephemeralDb, modes) {
  const { useTemplate, useDirect } = modes;
  const setup = await runPsql(target, ephemeralDb, {
    sql: `
      SELECT private.ensure_moderation_f0_ledger(
        private.moderation_f0_month_key(),
        4000,
        3999
      );
    `,
  });
  if (setup.status !== 0) {
    console.error("FAIL: setup", setup.stderr || setup.stdout);
    return 1;
  }

  const forceState = await runPsql(target, ephemeralDb, {
    sql: `
      UPDATE private.moderation_f0_ledger
      SET hard_budget = 4000,
          external_used = 3999,
          reserved_txn = 0,
          consumed_txn = 0,
          text_txn = 0,
          image_txn = 0,
          updated_at = NOW()
      WHERE month_key = private.moderation_f0_month_key();
      DELETE FROM private.moderation_f0_reservations
      WHERE month_key = private.moderation_f0_month_key();
      SELECT hard_budget - (external_used + reserved_txn + consumed_txn)
      FROM private.moderation_f0_ledger
      WHERE month_key = private.moderation_f0_month_key();
    `,
  });
  if (forceState.status !== 0) {
    console.error("FAIL: forceState", forceState.stderr || forceState.stdout);
    return 1;
  }
  const remaining = Number(lastLine(forceState));
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

  console.log(
    `PASS: ephemeral ${ephemeralDb} last-unit race → exactly 1 ok / 1 exhausted; used=4000` +
      (useTemplate ? " (TEMPLATE)" : useDirect ? " (DIRECT)" : " (bootstrap)"),
  );
  return 0;
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
