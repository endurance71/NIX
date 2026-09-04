import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSafePsqlEnv,
  buildStrippedChildEnv,
} from "./lib/safe-psql-env.mjs";

describe("buildSafePsqlEnv", () => {
  it("strips PGHOSTADDR PGSERVICE PGHOST and sets only PGPASSWORD", () => {
    const env = buildSafePsqlEnv("secret", {
      PATH: "/usr/bin",
      HOME: "/tmp",
      PGHOSTADDR: "192.0.2.1",
      PGSERVICE: "evil",
      PGHOST: "remote.invalid",
      PGPORT: "5432",
      PGUSER: "attacker",
      OTHER: "keep",
    });
    assert.equal(env.PGPASSWORD, "secret");
    assert.equal(env.PATH, "/usr/bin");
    assert.equal(env.OTHER, "keep");
    assert.equal(env.PGHOSTADDR, undefined);
    assert.equal(env.PGSERVICE, undefined);
    assert.equal(env.PGHOST, undefined);
    assert.equal(env.PGPORT, undefined);
    assert.equal(env.PGUSER, undefined);
    for (const key of Object.keys(env)) {
      if (key !== "PGPASSWORD") {
        assert.equal(key.startsWith("PG"), false, `leaked ${key}`);
      }
    }
  });
});

describe("buildStrippedChildEnv", () => {
  it("strips PG* then applies extras for isolated race spawn", () => {
    const env = buildStrippedChildEnv(
      {
        C3B_CONC_DIRECT: "1",
        C3B_CONC_ALLOW_PORT: "15432",
        C3B_ISOLATED_RUN_ID: "abc",
        SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:15432/postgres",
      },
      {
        PATH: "/bin",
        PGHOSTADDR: "203.0.113.9",
        PGSERVICE: "nope",
      },
    );
    assert.equal(env.C3B_CONC_DIRECT, "1");
    assert.equal(env.C3B_ISOLATED_RUN_ID, "abc");
    assert.equal(env.PGHOSTADDR, undefined);
    assert.equal(env.PGSERVICE, undefined);
  });
});
