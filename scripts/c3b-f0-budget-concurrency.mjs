#!/usr/bin/env node
/**
 * Two-connection F0 budget race for the LAST free unit (local Postgres only).
 *
 * FORBIDDEN outside local Supabase (loopback:54322). Exit 2 = BLOCKED.
 * Does NOT wipe entire ledger tables; only scopes cleanup to the current
 * UTC month_key after the allowlist check.
 *
 * Usage: node scripts/c3b-f0-budget-concurrency.mjs
 * Exit 0 = PASS, 1 = FAIL, 2 = BLOCKED (non-local / unavailable).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const DEFAULT_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_PORT = 54322;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function assertLocalDatabaseUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    console.error("BLOCKED: non-local database (invalid SUPABASE_DB_URL)");
    process.exit(2);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    console.error("BLOCKED: non-local database (unsupported protocol)");
    process.exit(2);
  }
  const host = (parsed.hostname || "").toLowerCase();
  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!LOCAL_HOSTS.has(host) || port !== LOCAL_PORT) {
    console.error(
      `BLOCKED: non-local database (host=${host || "?"} port=${port}; require loopback:${LOCAL_PORT})`,
    );
    process.exit(2);
  }
  return raw;
}

const DB = assertLocalDatabaseUrl(process.env.SUPABASE_DB_URL ?? DEFAULT_DB);

function runPsql(sql) {
  return new Promise((resolve) => {
    const child = spawn("psql", [DB, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
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

async function main() {
  const ping = await runPsql("SELECT 1");
  if (ping.status !== 0) {
    console.error("BLOCKED: local Postgres unavailable");
    console.error(ping.stderr || ping.stdout);
    process.exit(2);
  }

  // Prepare current UTC month: exactly one free unit. Scoped to that month_key only.
  const setup = await runPsql(`
    SELECT private.ensure_moderation_f0_ledger(
      private.moderation_f0_month_key(),
      4000,
      0
    );
    DELETE FROM private.moderation_f0_reservations
    WHERE month_key = private.moderation_f0_month_key();
    UPDATE private.moderation_f0_ledger
    SET hard_budget = 4000,
        external_used = 3999,
        reserved_txn = 0,
        consumed_txn = 0,
        text_txn = 0,
        image_txn = 0,
        updated_at = NOW()
    WHERE month_key = private.moderation_f0_month_key();
    SELECT hard_budget - (external_used + reserved_txn + consumed_txn)
    FROM private.moderation_f0_ledger
    WHERE month_key = private.moderation_f0_month_key();
  `);
  if (setup.status !== 0) {
    console.error("setup failed", setup.stderr || setup.stdout);
    process.exit(1);
  }
  const remaining = Number(lastLine(setup));
  if (remaining !== 1) {
    console.error(`FAIL: expected 1 remaining unit before race, got ${remaining}`);
    process.exit(1);
  }

  const a1 = randomUUID();
  const a2 = randomUUID();
  const sql = (attempt) =>
    `SET ROLE service_role; SELECT (public.reserve_moderation_budget('image', 1, NULL, '${attempt}', 4000, NULL)->>'ok');`;

  const [childA, childB] = await Promise.all([
    runPsql(sql(a1)),
    runPsql(sql(a2)),
  ]);

  const okCount = [childA, childB].filter(isTrue).length;
  const failCount = [childA, childB].filter(isFalse).length;

  const ledger = await runPsql(`
    SELECT external_used + reserved_txn + consumed_txn
    FROM private.moderation_f0_ledger
    WHERE month_key = private.moderation_f0_month_key();
  `);
  const used = Number(lastLine(ledger));

  if (okCount !== 1 || failCount !== 1 || used !== 4000) {
    console.error(
      `FAIL: expected exactly 1 ok / 1 fail and used=4000; got ok=${okCount} fail=${failCount} used=${used}`,
    );
    console.error("A", childA.stdout, childA.stderr);
    console.error("B", childB.stdout, childB.stderr);
    process.exit(1);
  }

  console.log(
    "PASS: concurrent two-connection race for last unit → exactly 1 ok / 1 exhausted; used=4000",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
