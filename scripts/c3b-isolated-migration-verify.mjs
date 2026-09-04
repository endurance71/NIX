#!/usr/bin/env node
/**
 * One-shot isolated migration verification stack (NOT the project supabase_db_NIX).
 *
 * - Docker on 127.0.0.1:15432 (supabase/postgres image)
 * - Real pg_cron; tight IPv4/IPv6 egress + probe before migrations
 * - Host psql uses strip-PG* env (no PGHOSTADDR hijack)
 * - Verified teardown; DIRECT race requires matching run_id sentinel
 * - Storage buckets stubbed (not a full Supabase reset substitute)
 *
 * Exit 0 = PASS, 1 = FAIL, 2 = PARTIAL/BLOCKED (infra)
 * Final exit is always computed after teardown (teardown fail → 1).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  blockEgress,
  finalExitCode,
  performTeardown,
  verifyEgress,
} from "./lib/c3b-isolated-guards.mjs";
import {
  buildSafePsqlEnv,
  buildStrippedChildEnv,
} from "./lib/safe-psql-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const F0_TEST = join(
  ROOT,
  "supabase",
  "tests",
  "pre_delivery_moderation_f0_budget_test.sql",
);
const COMPLETE_TEST = join(
  ROOT,
  "supabase",
  "tests",
  "complete_moderation_job_audit_test.sql",
);
const GRANTS_TEST = join(
  ROOT,
  "supabase",
  "tests",
  "security_definer_grants_test.sql",
);
const HOST_PORT = 15432;
const IMAGE_FALLBACK = "public.ecr.aws/supabase/postgres:17.6.1.165";
const PGUSER = "postgres";
const PGPASSWORD = "postgres";

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: opts.env ?? process.env,
      cwd: opts.cwd || ROOT,
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

function log(msg) {
  console.log(msg);
}

async function resolveImage() {
  const insp = await run("docker", [
    "inspect",
    "supabase_db_NIX",
    "--format",
    "{{.Config.Image}}",
  ]);
  if (insp.status === 0 && insp.stdout.trim()) {
    return insp.stdout.trim();
  }
  return IMAGE_FALLBACK;
}

async function psqlSql(sql) {
  return run(
    "psql",
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      "127.0.0.1",
      "-p",
      String(HOST_PORT),
      "-U",
      PGUSER,
      "-d",
      "postgres",
      "-At",
      "-c",
      sql,
    ],
    { env: buildSafePsqlEnv(PGPASSWORD) },
  );
}

async function psqlFile(file) {
  return run(
    "psql",
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      "127.0.0.1",
      "-p",
      String(HOST_PORT),
      "-U",
      PGUSER,
      "-d",
      "postgres",
      "-f",
      file,
    ],
    { env: buildSafePsqlEnv(PGPASSWORD) },
  );
}

async function waitForPostgres(maxMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await psqlSql(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='storage');",
    );
    if (r.status === 0 && r.stdout.trim() === "t") return true;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return false;
}

/** Storage tables live outside the postgres image; stub only what baseline needs. */
const STORAGE_STUB_SQL = `
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb,
  path_tokens text[],
  version text,
  owner_id text
);
GRANT ALL ON storage.buckets TO postgres, service_role;
GRANT ALL ON storage.objects TO postgres, service_role;
`;

/**
 * Image auth.users is an older GoTrue shape (confirmed_at, no email_confirmed_at).
 * pgTAP fixtures and GoTrue inserts expect the newer column names.
 */
const AUTH_USERS_COMPAT_SQL = `
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_confirmed_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_token_current character varying(255);
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_confirm_status smallint;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS reauthentication_token character varying(255);
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS reauthentication_sent_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_sso_user boolean NOT NULL DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
`;

async function runPgTap(label, file) {
  log(`RUN ${label}`);
  const tap = await psqlFile(file);
  const tapOut = tap.stdout + tap.stderr;
  if (tap.status !== 0 || /not ok /i.test(tapOut)) {
    console.error(`FAIL: ${label}`, tapOut);
    return false;
  }
  log(`${label}_OK`);
  return true;
}

async function main() {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const runId = randomUUID();
  const container = `c3b-mig-${id}`;
  const network = `c3b-mig-net-${id}`;
  // Never return from try — only set tryExit so finally can override via finalExitCode.
  let tryExit = 1;
  let started = false;
  let networkCreated = false;

  try {
    const image = await resolveImage();
    log(`IMAGE=${image}`);
    log(`CONTAINER=${container} PORT=127.0.0.1:${HOST_PORT} RUN_ID=${runId}`);

    const net = await run("docker", ["network", "create", network]);
    if (net.status !== 0) {
      console.error("BLOCKED: docker network create failed", net.stderr || net.stdout);
      tryExit = 2;
      return;
    }
    networkCreated = true;

    const runCtr = await run("docker", [
      "run",
      "-d",
      "--name",
      container,
      "--network",
      network,
      "--cap-add=NET_ADMIN",
      "-e",
      `POSTGRES_PASSWORD=${PGPASSWORD}`,
      "-p",
      `127.0.0.1:${HOST_PORT}:5432`,
      image,
    ]);
    if (runCtr.status !== 0) {
      console.error("BLOCKED: docker run failed", runCtr.stderr || runCtr.stdout);
      tryExit = 2;
      return;
    }
    started = true;
    log("CONTAINER_STARTED");

    if (!(await waitForPostgres())) {
      console.error("BLOCKED: postgres on :15432 did not become ready");
      tryExit = 2;
      return;
    }
    log("POSTGRES_READY");

    const egress = await blockEgress(run, container);
    if (!egress.ok) {
      console.error("BLOCKED: egress block failed:", egress.detail);
      console.error("Refusing to apply migrations that schedule prod HTTP without egress lock.");
      tryExit = 2;
      return;
    }
    if (egress.ipv6Mode === "IPV6_DISABLED_OK") {
      log("IPV6_DISABLED_OK");
    } else if (egress.ipv6Mode === "IPV6_BLOCKED_OK") {
      log("IPV6_BLOCKED_OK");
    }
    log("EGRESS_BLOCKED");

    const probe = await verifyEgress(run, container, {
      ipv6Enabled: Boolean(egress.ipv6Enabled),
    });
    if (!probe.ok) {
      console.error(
        `BLOCKED: egress isolation probe failed (${probe.reason}):`,
        probe.detail,
      );
      tryExit = 2;
      return;
    }
    log(`EGRESS_VERIFIED ${probe.detail}`);

    const cron = await psqlSql("CREATE EXTENSION IF NOT EXISTS pg_cron;");
    if (cron.status !== 0) {
      console.error("FAIL: CREATE EXTENSION pg_cron", cron.stderr || cron.stdout);
      tryExit = 1;
      return;
    }
    const cronCheck = await psqlSql(
      "SELECT extname FROM pg_extension WHERE extname = 'pg_cron';",
    );
    if (cronCheck.stdout.trim() !== "pg_cron") {
      console.error("FAIL: pg_cron extension missing");
      tryExit = 1;
      return;
    }
    log("PG_CRON_OK");

    const roleOk = await psqlSql(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT service_role TO CURRENT_USER;
    `);
    if (roleOk.status !== 0) {
      console.error("PARTIAL: role stubs failed", roleOk.stderr || roleOk.stdout);
      tryExit = 2;
      return;
    }
    const stubs = await run(
      "docker",
      [
        "exec",
        "-e",
        `PGPASSWORD=${PGPASSWORD}`,
        container,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "-c",
        STORAGE_STUB_SQL,
      ],
      { env: buildStrippedChildEnv({ PATH: process.env.PATH, HOME: process.env.HOME }) },
    );
    if (stubs.status !== 0) {
      console.error("PARTIAL: storage stubs failed", stubs.stderr || stubs.stdout);
      tryExit = 2;
      return;
    }
    log("STORAGE_STUB_OK");

    const authCompat = await run(
      "docker",
      [
        "exec",
        "-e",
        `PGPASSWORD=${PGPASSWORD}`,
        container,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "-c",
        AUTH_USERS_COMPAT_SQL,
      ],
      { env: buildStrippedChildEnv({ PATH: process.env.PATH, HOME: process.env.HOME }) },
    );
    if (authCompat.status !== 0) {
      console.error(
        "PARTIAL: auth.users compat columns failed",
        authCompat.stderr || authCompat.stdout,
      );
      tryExit = 2;
      return;
    }
    log("AUTH_USERS_COMPAT_OK");

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      log(`APPLY ${f}`);
      const applied = await psqlFile(join(MIGRATIONS_DIR, f));
      if (applied.status !== 0) {
        console.error(`FAIL: migration ${f}`, applied.stderr || applied.stdout);
        console.error(
          "status=PARTIAL (migration apply incomplete — not a clean project db reset PASS)",
        );
        tryExit = 1;
        return;
      }
    }
    log("MIGRATIONS_APPLIED");

    const hasReserve = await psqlSql(
      `SELECT COUNT(*)::int FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='reserve_moderation_budget';`,
    );
    if (Number(hasReserve.stdout.trim()) < 1) {
      console.error("FAIL: reserve_moderation_budget missing after migrations");
      tryExit = 1;
      return;
    }

    const sentinel = await psqlSql(`
      CREATE TABLE IF NOT EXISTS private.c3b_isolated_run (
        run_id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      DELETE FROM private.c3b_isolated_run;
      INSERT INTO private.c3b_isolated_run(run_id) VALUES ('${runId}');
    `);
    if (sentinel.status !== 0) {
      console.error("FAIL: isolated run sentinel", sentinel.stderr || sentinel.stdout);
      tryExit = 1;
      return;
    }
    log(`SENTINEL_OK ${runId}`);

    await psqlSql("CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;");
    if (!(await runPgTap("F0_PGTAP", F0_TEST))) {
      tryExit = 1;
      return;
    }
    if (!(await runPgTap("COMPLETE_AUDIT_PGTAP", COMPLETE_TEST))) {
      tryExit = 1;
      return;
    }
    if (!(await runPgTap("SECURITY_DEFINER_GRANTS_PGTAP", GRANTS_TEST))) {
      tryExit = 1;
      return;
    }

    log("RUN DIRECT race on migrated schema (isolated disposable DB)");
    const race = await run(
      "node",
      [join(ROOT, "scripts", "c3b-f0-budget-concurrency.mjs")],
      {
        env: buildStrippedChildEnv({
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          C3B_CONC_ALLOW_PORT: String(HOST_PORT),
          C3B_CONC_DIRECT: "1",
          C3B_ISOLATED_RUN_ID: runId,
          SUPABASE_DB_URL: `postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres`,
        }),
      },
    );
    process.stdout.write(race.stdout);
    process.stderr.write(race.stderr);
    if (race.status !== 0) {
      console.error(`FAIL: isolated DIRECT race exit=${race.status}`);
      tryExit = 1;
      return;
    }
    log("ISOLATED_DIRECT_RACE_OK");
    log("status=PASS isolated migrations + pgTAP(F0/complete/grants) + direct race");
    log("note: storage.buckets/objects stubbed — NOT a substitute for full project supabase db reset");
    tryExit = 0;
  } catch (err) {
    console.error(err);
    tryExit = 1;
  } finally {
    const { teardownOk, leftover } = await performTeardown(run, {
      started,
      networkCreated,
      container,
      network,
    });
    if (!teardownOk) {
      console.error(
        `TEARDOWN_FAIL${leftover ? `: ${leftover}` : " (docker rm/network/verify)"}`,
      );
    } else if (started || networkCreated) {
      log(`TEARDOWN_OK removed ${container} and ${network}`);
    }
    return finalExitCode(tryExit, teardownOk);
  }
}

const isDirect =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  main()
    .then((code) => process.exit(code ?? 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
