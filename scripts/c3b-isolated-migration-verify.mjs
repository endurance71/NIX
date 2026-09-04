#!/usr/bin/env node
/**
 * One-shot isolated migration verification stack (NOT the project supabase_db_NIX).
 *
 * - Docker container on 127.0.0.1:15432 only (supabase/postgres image)
 * - Waits for image migrate.sh init; ensures real pg_cron
 * - Outbound blocked via iptables (cron/pg_net must not hit prod URLs)
 * - No host prod .env / vault secrets mounted
 * - Applies supabase/migrations/*.sql, then F0 pgTAP + TEMPLATE race
 *
 * Exit 0 = PASS, 1 = FAIL, 2 = PARTIAL/BLOCKED (infra)
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const F0_TEST = join(
  ROOT,
  "supabase",
  "tests",
  "pre_delivery_moderation_f0_budget_test.sql",
);
const HOST_PORT = 15432;
const IMAGE_FALLBACK = "public.ecr.aws/supabase/postgres:17.6.1.165";
const PGUSER = "postgres";
const PGPASSWORD = "postgres";

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...(opts.env || {}) },
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
    { env: { ...process.env, PGPASSWORD } },
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
    { env: { ...process.env, PGPASSWORD } },
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

async function blockEgress(container) {
  await run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    "command -v iptables >/dev/null || apk add --no-cache iptables >/dev/null 2>&1",
  ]);
  const has = await run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    "command -v iptables",
  ]);
  if (has.status !== 0) {
    return { ok: false, detail: "iptables unavailable" };
  }
  const script = [
    "iptables -F OUTPUT 2>/dev/null || true",
    "iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT || iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    "iptables -A OUTPUT -o lo -j ACCEPT",
    "iptables -A OUTPUT -d 127.0.0.0/8 -j ACCEPT",
    "iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT",
    "iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT",
    "iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT",
    "iptables -P OUTPUT DROP",
    "iptables -L OUTPUT -n",
  ].join(" && ");
  const r = await run("docker", ["exec", container, "sh", "-c", script]);
  if (r.status !== 0) {
    return { ok: false, detail: r.stderr || r.stdout };
  }
  return { ok: true, detail: r.stdout };
}

/** Storage tables live outside the postgres image now; stub only what baseline needs. */
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

async function main() {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const container = `c3b-mig-${id}`;
  const network = `c3b-mig-net-${id}`;
  let exitCode = 1;
  let started = false;

  try {
    const image = await resolveImage();
    log(`IMAGE=${image}`);
    log(`CONTAINER=${container} PORT=127.0.0.1:${HOST_PORT}`);

    const net = await run("docker", ["network", "create", network]);
    if (net.status !== 0) {
      console.error("BLOCKED: docker network create failed", net.stderr || net.stdout);
      return 2;
    }

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
      return 2;
    }
    started = true;
    log("CONTAINER_STARTED");

    if (!(await waitForPostgres())) {
      console.error("BLOCKED: postgres on :15432 did not become ready");
      return 2;
    }
    log("POSTGRES_READY");

    const egress = await blockEgress(container);
    if (!egress.ok) {
      console.error("PARTIAL: egress block failed:", egress.detail);
      console.error("Refusing to apply migrations that schedule prod HTTP without egress lock.");
      return 2;
    }
    log("EGRESS_BLOCKED");

    const cron = await psqlSql("CREATE EXTENSION IF NOT EXISTS pg_cron;");
    if (cron.status !== 0) {
      console.error("FAIL: CREATE EXTENSION pg_cron", cron.stderr || cron.stdout);
      return 1;
    }
    const cronCheck = await psqlSql(
      "SELECT extname FROM pg_extension WHERE extname = 'pg_cron';",
    );
    if (cronCheck.stdout.trim() !== "pg_cron") {
      console.error("FAIL: pg_cron extension missing");
      return 1;
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
      return 2;
    }
    const stubs = await run("docker", [
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
    ]);
    if (stubs.status !== 0) {
      console.error("PARTIAL: storage stubs failed", stubs.stderr || stubs.stdout);
      return 2;
    }
    log("STORAGE_STUB_OK");

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      log(`APPLY ${f}`);
      const applied = await psqlFile(join(MIGRATIONS_DIR, f));
      if (applied.status !== 0) {
        console.error(`FAIL: migration ${f}`, applied.stderr || applied.stdout);
        console.error(
          "status=PARTIAL (migration apply incomplete — not a clean reset PASS)",
        );
        return 1;
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
      return 1;
    }

    await psqlSql("CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;");
    log("RUN F0 pgTAP");
    const tap = await psqlFile(F0_TEST);
    const tapOut = tap.stdout + tap.stderr;
    if (tap.status !== 0 || /not ok /i.test(tapOut)) {
      console.error("FAIL: F0 pgTAP", tapOut);
      return 1;
    }
    log("F0_PGTAP_OK");

    log("RUN DIRECT race on migrated schema (isolated disposable DB)");
    const race = await run("node", [join(ROOT, "scripts", "c3b-f0-budget-concurrency.mjs")], {
      env: {
        ...process.env,
        C3B_CONC_ALLOW_PORT: String(HOST_PORT),
        C3B_CONC_DIRECT: "1",
        SUPABASE_DB_URL: `postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres`,
      },
    });
    process.stdout.write(race.stdout);
    process.stderr.write(race.stderr);
    if (race.status !== 0) {
      console.error(`FAIL: isolated DIRECT race on migrated schema exit=${race.status}`);
      return 1;
    }
    log("ISOLATED_DIRECT_RACE_OK");
    log("status=PASS isolated migrations + pgTAP + direct race on migrated schema");
    log("note: storage.buckets/objects stubbed (not in postgres image); pg_cron is real extension");
    log("note: TEMPLATE skipped on this stack (internal sessions); DIRECT race uses migrated RPCs");
    exitCode = 0;
  } catch (err) {
    console.error(err);
    exitCode = 1;
  } finally {
    if (started) {
      await run("docker", ["rm", "-f", container]);
      log(`TEARDOWN: removed ${container}`);
    }
    await run("docker", ["network", "rm", network]);
  }

  return exitCode;
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
