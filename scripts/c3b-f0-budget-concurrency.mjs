#!/usr/bin/env node
/**
 * Two-connection F0 budget race at the hard cap (local Postgres only).
 * Usage: node scripts/c3b-f0-budget-concurrency.mjs
 * Exit 0 = PASS, 1 = FAIL, 2 = BLOCKED (no local DB).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const DB = process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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

async function main() {
  const ping = await runPsql("SELECT 1");
  if (ping.status !== 0) {
    console.error("BLOCKED: local Postgres unavailable");
    console.error(ping.stderr || ping.stdout);
    process.exit(2);
  }

  const setup = await runPsql(`
    DELETE FROM private.moderation_f0_reservations;
    DELETE FROM private.moderation_f0_ledger;
    SELECT private.ensure_moderation_f0_ledger(
      private.moderation_f0_month_key(),
      2,
      0
    );
  `);
  if (setup.status !== 0) {
    console.error("setup failed", setup.stderr || setup.stdout);
    process.exit(1);
  }

  const a1 = randomUUID();
  const a2 = randomUUID();
  const sql = (attempt) =>
    `SET ROLE service_role; SELECT (public.reserve_moderation_budget('image', 1, NULL, '${attempt}', 2, 0)->>'ok');`;

  // Launch both connections concurrently.
  const [childA, childB] = await Promise.all([
    runPsql(sql(a1)),
    runPsql(sql(a2)),
  ]);

  const lastLine = (c) => c.stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  const isTrue = (c) => {
    const v = lastLine(c).toLowerCase();
    return c.status === 0 && (v === "t" || v === "true");
  };
  const isFalse = (c) => {
    const v = lastLine(c).toLowerCase();
    return c.status === 0 && (v === "f" || v === "false");
  };

  const okCount = [childA, childB].filter(isTrue).length;

  const ledger = await runPsql(`
    SELECT reserved_txn + consumed_txn
    FROM private.moderation_f0_ledger
    WHERE month_key = private.moderation_f0_month_key();
  `);
  const used = Number((ledger.stdout || "").trim());

  if (okCount !== 2 || used !== 2) {
    console.error(
      `FAIL: expected 2 ok reserves and used=2, got ok=${okCount} used=${used}`,
    );
    console.error("A", childA.stdout, childA.stderr);
    console.error("B", childB.stdout, childB.stderr);
    process.exit(1);
  }

  const a3 = randomUUID();
  const third = await runPsql(sql(a3));
  if (!isFalse(third)) {
    console.error("FAIL: third reserve should be exhausted", third.stdout, third.stderr);
    process.exit(1);
  }

  console.log("PASS: concurrent two-connection reserve fills hard_budget=2; third exhausted");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
