import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseApprovedLocalTarget } from "./c3b-f0-budget-concurrency.mjs";

const OK = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("parseApprovedLocalTarget", () => {
  it("accepts clean loopback:54322", () => {
    const t = parseApprovedLocalTarget(OK);
    assert.equal(t.host, "127.0.0.1");
    assert.equal(t.port, 54322);
    assert.equal(t.user, "postgres");
    assert.equal(t.password, "postgres");
  });

  it("accepts localhost and ::1", () => {
    assert.equal(
      parseApprovedLocalTarget(
        "postgresql://postgres:postgres@localhost:54322/postgres",
      ).host,
      "localhost",
    );
    assert.equal(
      parseApprovedLocalTarget(
        "postgresql://postgres:postgres@[::1]:54322/postgres",
      ).host,
      "::1",
    );
  });

  it("rejects remote host", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@db.xxx.supabase.co:54322/postgres",
        ),
      /BLOCKED/,
    );
  });

  it("rejects ?host= override", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=remote.invalid",
        ),
      /BLOCKED/,
    );
  });

  it("rejects ?hostaddr= override", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres?hostaddr=192.0.2.1",
        ),
      /BLOCKED/,
    );
  });

  it("rejects ?service= override", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres?service=evil",
        ),
      /BLOCKED/,
    );
  });

  it("rejects wrong port", () => {
    assert.throws(
      () =>
        parseApprovedLocalTarget(
          "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
        ),
      /BLOCKED/,
    );
  });

  it("rejects invalid URL", () => {
    assert.throws(() => parseApprovedLocalTarget("not-a-url"), /BLOCKED/);
  });

  it("rejects empty string", () => {
    assert.throws(() => parseApprovedLocalTarget(""), /BLOCKED/);
  });
});
