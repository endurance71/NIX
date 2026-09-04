import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseApprovedLocalTarget } from "./c3b-f0-budget-concurrency.mjs";

const OK = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const HARNESS = join(dirname(fileURLToPath(import.meta.url)), "c3b-f0-budget-concurrency.mjs");

describe("parseApprovedLocalTarget", () => {
  it("accepts clean loopback:54322", () => {
    const t = parseApprovedLocalTarget(OK, { allowedPort: 54322 });
    assert.equal(t.host, "127.0.0.1");
    assert.equal(t.port, 54322);
    assert.equal(t.user, "postgres");
    assert.equal(t.password, "postgres");
  });

  it("accepts localhost and ::1", () => {
    assert.equal(
      parseApprovedLocalTarget(
        "postgresql://postgres:postgres@localhost:54322/postgres",
        { allowedPort: 54322 },
      ).host,
      "localhost",
    );
    assert.equal(
      parseApprovedLocalTarget(
        "postgresql://postgres:postgres@[::1]:54322/postgres",
        { allowedPort: 54322 },
      ).host,
      "::1",
    );
  });

  it("accepts isolated stack port 15432 when allowed", () => {
    const t = parseApprovedLocalTarget(
      "postgresql://postgres:postgres@127.0.0.1:15432/postgres",
      { allowedPort: 15432 },
    );
    assert.equal(t.port, 15432);
  });

  it("rejects remote host", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@db.xxx.supabase.co:54322/postgres",
          { allowedPort: 54322 },
        ),
      /BLOCKED/,
    );
  });

  it("rejects ?host= override", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=remote.invalid",
          { allowedPort: 54322 },
        ),
      /BLOCKED/,
    );
  });

  it("rejects ?hostaddr= override", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres?hostaddr=192.0.2.1",
          { allowedPort: 54322 },
        ),
      /BLOCKED/,
    );
  });

  it("rejects ?service= override", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres?service=evil",
          { allowedPort: 54322 },
        ),
      /BLOCKED/,
    );
  });

  it("rejects wrong port", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
          { allowedPort: 54322 },
        ),
      /BLOCKED/,
    );
  });

  it("rejects invalid URL", () => {
    assert.throws(
      () => parseApprovedLocalTarget("not-a-url", { allowedPort: 54322 }),
      /BLOCKED/,
    );
  });

  it("rejects empty string", () => {
    assert.throws(
      () => parseApprovedLocalTarget("", { allowedPort: 54322 }),
      /BLOCKED/,
    );
  });
});

describe("harness safety", () => {
  it("never calls pg_terminate_backend", () => {
    const src = readFileSync(HARNESS, "utf8");
    assert.equal(/pg_terminate_backend\s*\(/.test(src), false);
  });
});
