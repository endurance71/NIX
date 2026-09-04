#!/usr/bin/env node
/**
 * Disposable Auth + Storage + Kong + Postgres verification stack.
 * NOT the everyday supabase_*_NIX project (ports 54321–54329 untouched).
 *
 * - Host ports: 127.0.0.1:15532 (db), 127.0.0.1:15521 (kong)
 * - Internal docker network (--internal) + Postgres iptables allow CIDR only
 * - Real GoTrue + storage-api (no storage table stubs)
 * - Path A: all migrations from zero
 * - Path B: bootstrap through 20260831150000_… then remaining
 *
 * Exit 0 = PASS, 1 = FAIL, 2 = BLOCKED/PARTIAL
 * Teardown fail always → 1.
 *
 * Tests: runAuthStorageVerify({ run, path }) — CLI has no new user modes beyond path.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  blockInternalEgress,
  finalExitCode,
  performStackTeardown,
  resolveNetworkCidr,
  verifyEgress,
  verifyInternalPeerProbe,
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

export const HOST_DB_PORT = 15532;
export const HOST_API_PORT = 15521;
export const PATH_B_TIP = "20260831150000_pre_delivery_moderation_f0_budget.sql";

const IMAGE_PG = "public.ecr.aws/supabase/postgres:17.6.1.165";
const IMAGE_AUTH = "public.ecr.aws/supabase/gotrue:v2.193.0";
const IMAGE_STORAGE = "public.ecr.aws/supabase/storage-api:v1.65.1";
const IMAGE_KONG = "public.ecr.aws/supabase/kong:2.8.1";

/** Local-only Supabase demo JWT material — never prod / Azure vault. */
const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const PGUSER = "postgres";
const PGPASSWORD = "postgres";

export function createDefaultRun() {
  return function run(cmd, args, opts = {}) {
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
      child.on("close", (status) =>
        resolve({ status: status ?? 1, stdout, stderr }),
      );
    });
  };
}

function log(msg) {
  console.log(msg);
}

function resolvePath(deps) {
  const raw = String(deps.path ?? process.env.C3B_AUTHSTORE_PATH ?? "A").toUpperCase();
  if (raw !== "A" && raw !== "B") {
    throw new Error(`BLOCKED: path must be A|B, got ${raw}`);
  }
  return raw;
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function filesForPath(path) {
  const all = migrationFiles();
  if (path === "A") return { bootstrap: [], remaining: all };
  const tipIdx = all.indexOf(PATH_B_TIP);
  if (tipIdx < 0) {
    throw new Error(`BLOCKED: Path B tip missing: ${PATH_B_TIP}`);
  }
  return {
    bootstrap: all.slice(0, tipIdx + 1),
    remaining: all.slice(tipIdx + 1),
  };
}

function buildKongYml() {
  return `_format_version: "1.1"
services:
  - name: auth-v1
    url: http://auth:9999/
    routes:
      - name: auth-v1-all
        strip_path: true
        paths:
          - /auth/v1/
  - name: storage-v1
    url: http://storage:5000/
    routes:
      - name: storage-v1-all
        strip_path: true
        paths:
          - /storage/v1/
`;
}

/**
 * @param {{
 *   run?: ReturnType<typeof createDefaultRun>,
 *   path?: 'A'|'B'|string,
 * }} [deps]
 */
export async function runAuthStorageVerify(deps = {}) {
  const run = deps.run ?? createDefaultRun();
  const path = resolvePath(deps);
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const runId = randomUUID();
  const network = `c3b-authstore-net-${id}`;
  const volume = `c3b-authstore-vol-${id}`;
  const dbName = `c3b-authstore-${id}-db`;
  const authName = `c3b-authstore-${id}-auth`;
  const storageName = `c3b-authstore-${id}-storage`;
  const kongName = `c3b-authstore-${id}-kong`;
  const containers = [];
  const volumes = [];
  let networkCreated = false;
  let tryExit = 1;
  let kongDir = "";

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
        String(HOST_DB_PORT),
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
        String(HOST_DB_PORT),
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

  async function waitHttp(url, maxMs = 120_000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const r = await run("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", url], {
        env: buildStrippedChildEnv({ PATH: process.env.PATH, HOME: process.env.HOME }),
      });
      const code = Number(r.stdout.trim());
      if (r.status === 0 && code > 0 && code < 500) return true;
      await new Promise((res) => setTimeout(res, 2000));
    }
    return false;
  }

  async function applyMigrations(files) {
    for (const f of files) {
      log(`APPLY ${f}`);
      const applied = await psqlFile(join(MIGRATIONS_DIR, f));
      if (applied.status !== 0) {
        console.error(`FAIL: migration ${f}`, applied.stderr || applied.stdout);
        return false;
      }
    }
    return true;
  }

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

  try {
    log(`PATH=${path} RUN_ID=${runId}`);
    log(`IMAGES pg=${IMAGE_PG} auth=${IMAGE_AUTH} storage=${IMAGE_STORAGE} kong=${IMAGE_KONG}`);

    // Do not use --internal: on Docker Desktop it blocks host→published ports
    // (psql :15532 / kong :15521). External egress is fail-closed via iptables CIDR.
    const net = await run("docker", ["network", "create", network]);
    if (net.status !== 0) {
      console.error("BLOCKED: network create failed", net.stderr || net.stdout);
      tryExit = 2;
      return;
    }
    networkCreated = true;

    const vol = await run("docker", ["volume", "create", volume]);
    if (vol.status !== 0) {
      console.error("BLOCKED: volume create failed", vol.stderr || vol.stdout);
      tryExit = 2;
      return;
    }
    volumes.push(volume);

    const dbRun = await run("docker", [
      "run",
      "-d",
      "--name",
      dbName,
      "--network",
      network,
      "--network-alias",
      "db",
      "--cap-add=NET_ADMIN",
      "-e",
      `POSTGRES_PASSWORD=${PGPASSWORD}`,
      "-p",
      `127.0.0.1:${HOST_DB_PORT}:5432`,
      IMAGE_PG,
    ]);
    if (dbRun.status !== 0) {
      console.error("BLOCKED: db run failed", dbRun.stderr || dbRun.stdout);
      tryExit = 2;
      return;
    }
    containers.push(dbName);
    log("DB_STARTED");

    if (!(await waitForPostgres())) {
      console.error("BLOCKED: postgres on :15532 not ready");
      tryExit = 2;
      return;
    }
    log("POSTGRES_READY");

    // Image creates reserved roles without password until supabase_admin sets them.
    const passInit = await run(
      "psql",
      [
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        "127.0.0.1",
        "-p",
        String(HOST_DB_PORT),
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "-c",
        "ALTER ROLE supabase_auth_admin WITH PASSWORD 'postgres'; ALTER ROLE supabase_storage_admin WITH PASSWORD 'postgres';",
      ],
      { env: buildSafePsqlEnv(PGPASSWORD) },
    );
    if (passInit.status !== 0) {
      console.error(
        "BLOCKED: cannot set auth/storage role passwords",
        passInit.stderr || passInit.stdout,
      );
      tryExit = 2;
      return;
    }
    log("ROLE_PASSWORDS_OK");

    const cidrInfo = await resolveNetworkCidr(run, network);
    if (!cidrInfo.ok) {
      console.error("BLOCKED: cannot resolve network CIDR", cidrInfo.detail);
      tryExit = 2;
      return;
    }
    const egress = await blockInternalEgress(run, dbName, cidrInfo.cidr);
    if (!egress.ok) {
      console.error("BLOCKED: internal egress lock failed:", egress.detail);
      tryExit = 2;
      return;
    }
    log(`EGRESS_INTERNAL_OK cidr=${cidrInfo.cidr}`);

    const probe = await verifyEgress(run, dbName, { ipv6Enabled: false });
    if (!probe.ok) {
      console.error(
        `BLOCKED: public egress probe failed (${probe.reason}):`,
        probe.detail,
      );
      tryExit = 2;
      return;
    }
    log(`EGRESS_PUBLIC_BLOCKED ${probe.detail}`);

    const authRun = await run("docker", [
      "run",
      "-d",
      "--name",
      authName,
      "--network",
      network,
      "--network-alias",
      "auth",
      "-e",
      "GOTRUE_API_HOST=0.0.0.0",
      "-e",
      "GOTRUE_API_PORT=9999",
      "-e",
      "API_EXTERNAL_URL=http://127.0.0.1:15521/auth/v1",
      "-e",
      "GOTRUE_DB_DRIVER=postgres",
      "-e",
      "GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:postgres@db:5432/postgres",
      "-e",
      `GOTRUE_JWT_SECRET=${JWT_SECRET}`,
      "-e",
      "GOTRUE_JWT_AUD=authenticated",
      "-e",
      "GOTRUE_JWT_ISSUER=http://127.0.0.1:15521/auth/v1",
      "-e",
      "GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated",
      "-e",
      "GOTRUE_JWT_ADMIN_ROLES=service_role",
      "-e",
      "GOTRUE_SITE_URL=http://127.0.0.1:15521",
      "-e",
      "GOTRUE_URI_ALLOW_LIST=http://127.0.0.1:15521",
      "-e",
      "GOTRUE_DISABLE_SIGNUP=false",
      "-e",
      "GOTRUE_MAILER_AUTOCONFIRM=true",
      "-e",
      "GOTRUE_EXTERNAL_EMAIL_ENABLED=true",
      "-e",
      "GOTRUE_EXTERNAL_PHONE_ENABLED=false",
      "-e",
      "GOTRUE_EXTERNAL_APPLE_ENABLED=false",
      IMAGE_AUTH,
    ]);
    if (authRun.status !== 0) {
      console.error("BLOCKED: auth run failed", authRun.stderr || authRun.stdout);
      tryExit = 2;
      return;
    }
    containers.push(authName);

    const storageRun = await run("docker", [
      "run",
      "-d",
      "--name",
      storageName,
      "--network",
      network,
      "--network-alias",
      "storage",
      "-e",
      "DATABASE_URL=postgresql://supabase_storage_admin:postgres@db:5432/postgres",
      "-e",
      `PGRST_JWT_SECRET=${JWT_SECRET}`,
      "-e",
      `JWT_SECRET=${JWT_SECRET}`,
      "-e",
      `ANON_KEY=${ANON_KEY}`,
      "-e",
      `SERVICE_KEY=${SERVICE_KEY}`,
      "-e",
      "STORAGE_BACKEND=file",
      "-e",
      "FILE_STORAGE_BACKEND_PATH=/var/lib/storage",
      "-e",
      "TENANT_ID=stub",
      "-e",
      "GLOBAL_S3_BUCKET=stub",
      "-e",
      "REGION=local",
      "-e",
      "REQUEST_ALLOW_X_FORWARDED_PATH=true",
      "-v",
      `${volume}:/var/lib/storage`,
      IMAGE_STORAGE,
    ]);
    if (storageRun.status !== 0) {
      console.error("BLOCKED: storage run failed", storageRun.stderr || storageRun.stdout);
      tryExit = 2;
      return;
    }
    containers.push(storageName);

    // GoTrue image has no shell/nc — probe peer path via alpine on the same network.
    const peerCtr = `c3b-authstore-${id}-peer`;
    const peerRun = await run("docker", [
      "run",
      "-d",
      "--name",
      peerCtr,
      "--network",
      network,
      "alpine:3.20",
      "sleep",
      "30",
    ]);
    if (peerRun.status !== 0) {
      console.error("BLOCKED: peer probe helper failed", peerRun.stderr || peerRun.stdout);
      tryExit = 2;
      return;
    }
    containers.push(peerCtr);
    const peer = await verifyInternalPeerProbe(run, peerCtr, "db", 5432);
    if (!peer.ok) {
      console.error(`BLOCKED: internal db peer probe failed (${peer.reason}):`, peer.detail);
      tryExit = 2;
      return;
    }
    log(`PEER_OK ${peer.detail}`);

    // Auth must stay up (proves DB connectivity for GoTrue).
    await new Promise((res) => setTimeout(res, 3000));
    const authState = await run("docker", [
      "inspect",
      "-f",
      "{{.State.Running}}",
      authName,
    ]);
    if (authState.status !== 0 || authState.stdout.trim() !== "true") {
      const logs = await run("docker", ["logs", authName]);
      console.error(
        "BLOCKED: auth container not running",
        logs.stderr || logs.stdout || authState.stderr,
      );
      tryExit = 2;
      return;
    }
    log("AUTH_CONTAINER_RUNNING");

    kongDir = join(
      process.env.HOME || tmpdir(),
      ".nix-ops",
      "p0-3-c3b-audit-fixes",
      `kong-cfg-${id}`,
    );
    mkdirSync(kongDir, { recursive: true });
    // Bind-mount from $HOME (Docker Desktop shares it; /tmp often does not).
    writeFileSync(join(kongDir, "kong.yml"), buildKongYml());

    const kongRun = await run("docker", [
      "run",
      "-d",
      "--name",
      kongName,
      "--network",
      network,
      "-e",
      "KONG_DATABASE=off",
      "-e",
      "KONG_DECLARATIVE_CONFIG=/kong/kong.yml",
      "-e",
      "KONG_DNS_ORDER=LAST,A,CNAME",
      "-e",
      "KONG_PLUGINS=cors",
      "-p",
      `127.0.0.1:${HOST_API_PORT}:8000`,
      "-v",
      `${kongDir}:/kong:ro`,
      IMAGE_KONG,
    ]);
    if (kongRun.status !== 0) {
      console.error("BLOCKED: kong run failed", kongRun.stderr || kongRun.stdout);
      tryExit = 2;
      return;
    }
    containers.push(kongName);
    log("STACK_STARTED");

    if (!(await waitHttp(`http://127.0.0.1:${HOST_API_PORT}/auth/v1/health`))) {
      console.error("BLOCKED: auth via kong not ready");
      tryExit = 2;
      return;
    }
    log("AUTH_HTTP_READY");

    const cron = await psqlSql("CREATE EXTENSION IF NOT EXISTS pg_cron;");
    if (cron.status !== 0) {
      console.error("FAIL: pg_cron", cron.stderr || cron.stdout);
      tryExit = 1;
      return;
    }

    const roleOk = await psqlSql(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT service_role TO CURRENT_USER;
    `);
    if (roleOk.status !== 0) {
      console.error("PARTIAL: roles", roleOk.stderr || roleOk.stdout);
      tryExit = 2;
      return;
    }

    const { bootstrap, remaining } = filesForPath(path);
    if (bootstrap.length) {
      log(`PATH_B_BOOTSTRAP tip=${PATH_B_TIP} count=${bootstrap.length}`);
      if (!(await applyMigrations(bootstrap))) {
        tryExit = 1;
        return;
      }
      log("PATH_B_BOOTSTRAP_OK");
    }
    if (!(await applyMigrations(remaining))) {
      tryExit = 1;
      return;
    }
    log("MIGRATIONS_APPLIED");

    const hasReserve = await psqlSql(
      `SELECT COUNT(*)::int FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='reserve_moderation_budget';`,
    );
    if (Number(hasReserve.stdout.trim()) < 1) {
      console.error("FAIL: reserve_moderation_budget missing");
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
      console.error("FAIL: sentinel", sentinel.stderr || sentinel.stdout);
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

    const race = await run(
      "node",
      [join(ROOT, "scripts", "c3b-f0-budget-concurrency.mjs")],
      {
        env: buildStrippedChildEnv({
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          C3B_CONC_ALLOW_PORT: String(HOST_DB_PORT),
          C3B_CONC_DIRECT: "1",
          C3B_ISOLATED_RUN_ID: runId,
          SUPABASE_DB_URL: `postgresql://postgres:postgres@127.0.0.1:${HOST_DB_PORT}/postgres`,
        }),
      },
    );
    process.stdout.write(race.stdout);
    process.stderr.write(race.stderr);
    if (race.status !== 0) {
      console.error(`FAIL: DIRECT race exit=${race.status}`);
      tryExit = 1;
      return;
    }
    log("ISOLATED_DIRECT_RACE_OK");

    const email = `c3b-${id}@example.invalid`;
    const password = "c3b-test-password-9";
    const signup = await run(
      "curl",
      [
        "-sS",
        "-X",
        "POST",
        `http://127.0.0.1:${HOST_API_PORT}/auth/v1/signup`,
        "-H",
        `apikey: ${ANON_KEY}`,
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify({ email, password }),
      ],
      { env: buildStrippedChildEnv({ PATH: process.env.PATH, HOME: process.env.HOME }) },
    );
    if (signup.status !== 0 || !/access_token|"id"/.test(signup.stdout)) {
      console.error("FAIL: auth signup", signup.stdout || signup.stderr);
      tryExit = 1;
      return;
    }
    log("AUTH_SIGNUP_OK");

    const bucket = await run(
      "curl",
      [
        "-sS",
        "-X",
        "POST",
        `http://127.0.0.1:${HOST_API_PORT}/storage/v1/bucket`,
        "-H",
        `apikey: ${SERVICE_KEY}`,
        "-H",
        `Authorization: Bearer ${SERVICE_KEY}`,
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify({ id: "c3b-smoke", name: "c3b-smoke", public: false }),
      ],
      { env: buildStrippedChildEnv({ PATH: process.env.PATH, HOME: process.env.HOME }) },
    );
    // bucket may already exist from migrations — allow conflict-ish bodies
    if (bucket.status !== 0) {
      console.error("FAIL: storage bucket", bucket.stdout || bucket.stderr);
      tryExit = 1;
      return;
    }
    log("STORAGE_BUCKET_OK");

    const upload = await run(
      "curl",
      [
        "-sS",
        "-X",
        "POST",
        `http://127.0.0.1:${HOST_API_PORT}/storage/v1/object/c3b-smoke/smoke-${id}.txt`,
        "-H",
        `apikey: ${SERVICE_KEY}`,
        "-H",
        `Authorization: Bearer ${SERVICE_KEY}`,
        "-H",
        "Content-Type: text/plain",
        "--data-binary",
        "c3b-authstore-smoke",
      ],
      { env: buildStrippedChildEnv({ PATH: process.env.PATH, HOME: process.env.HOME }) },
    );
    if (upload.status !== 0) {
      console.error("FAIL: storage upload", upload.stdout || upload.stderr);
      tryExit = 1;
      return;
    }
    const obj = await psqlSql(
      "SELECT COUNT(*)::int FROM storage.objects WHERE bucket_id='c3b-smoke';",
    );
    if (Number(obj.stdout.trim()) < 1) {
      console.error("FAIL: storage.objects row missing after upload", obj.stdout, upload.stdout);
      tryExit = 1;
      return;
    }
    log("STORAGE_UPLOAD_OK");
    log(`status=PASS path=${path} auth+storage real stack`);
    tryExit = 0;
  } catch (err) {
    console.error(err);
    tryExit = 1;
  } finally {
    const { teardownOk, leftover } = await performStackTeardown(run, {
      containers,
      network: networkCreated ? network : "",
      volumes,
    });
    if (kongDir) {
      try {
        rmSync(kongDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    if (!teardownOk) {
      console.error(
        `TEARDOWN_FAIL${leftover ? `: ${leftover}` : " (stack resources)"}`,
      );
    } else if (containers.length || networkCreated || volumes.length) {
      log("TEARDOWN_OK authstore stack removed");
    }
    return finalExitCode(tryExit, teardownOk);
  }
}

const isDirect =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  runAuthStorageVerify()
    .then((code) => process.exit(code ?? 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
