import {
  createSupabaseRpc,
  loadTextPayload,
  resolveClaimedJob,
} from "./main.ts";
import {
  assertSafeObjectPath,
  jobTempDir,
  removeLocalJobFile,
  storageObjectUrl,
} from "./download.ts";
import { JOB_TEMP_DIRNAME } from "./constants.ts";

function assert(value: unknown, message = "assertion_failed"): asserts value {
  if (!value) throw new Error(message);
}

async function assertRejects(
  fn: () => Promise<unknown>,
  snippet: string,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(snippet),
      `expected ${snippet}, got ${error}`,
    );
    return;
  }
  throw new Error(`expected reject ${snippet}`);
}

const JOB_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ASSET_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

Deno.test("createSupabaseRpc maps HTTP errors without throwing", async () => {
  const rpc = createSupabaseRpc(
    "https://example.supabase.co",
    "service-role",
    async () =>
      new Response(JSON.stringify({ message: "nope" }), { status: 401 }),
  );
  const result = await rpc("claim_moderation_jobs", { p_limit: 1 });
  assert(result.data === null);
  assert((result.error as { status: number }).status === 401);
});

Deno.test("loadTextPayload reads body via PostgREST object+json", async () => {
  const body = await loadTextPayload(
    "https://example.supabase.co",
    "service-role",
    "11111111-1111-1111-1111-111111111111",
    async (input) => {
      assert(String(input).includes("moderation_text_payloads"));
      return new Response(JSON.stringify({ body: "Cześć" }), { status: 200 });
    },
  );
  assert(body === "Cześć");
});

Deno.test("storageObjectUrl encodes path segments and rejects traversal", () => {
  const url = storageObjectUrl(
    "https://example.supabase.co",
    "nixes/user/file.jpg",
  );
  assert(url.includes("/storage/v1/object/media-vault/nixes/user/file.jpg"));
  let failed = false;
  try {
    assertSafeObjectPath("nixes/../secret.jpg");
  } catch (error) {
    failed = error instanceof Error && error.message === "media_path_invalid";
    assert(
      !(error instanceof Error && error.message.includes("nixes")),
      "path must not leak into the error",
    );
  }
  assert(failed);
  try {
    assertSafeObjectPath("https://evil.example/a.jpg");
    failed = false;
  } catch {
    failed = true;
  }
  assert(failed);
});

Deno.test("resolveClaimedJob streams image bytes from media-vault", async () => {
  const destDir = await Deno.makeTempDir({ prefix: `${JOB_TEMP_DIRNAME}-` });
  const nested = `${destDir}/${JOB_TEMP_DIRNAME}`;
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  try {
    const resolved = await resolveClaimedJob(
      "https://example.supabase.co",
      "service-role",
      {
        id: JOB_ID,
        content_kind: "media",
        asset_id: ASSET_ID,
      },
      {
        destDir: nested,
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("media_assets")) {
            assert(url.includes(ASSET_ID));
            return new Response(
              JSON.stringify({
                storage_path: "nixes/user/photo.jpg",
                media_type: "image",
                size_bytes: jpeg.byteLength,
                status: "moderation_pending",
              }),
              { status: 200 },
            );
          }
          assert(url.includes("/storage/v1/object/media-vault/nixes/user/photo.jpg"));
          return new Response(jpeg, {
            status: 200,
            headers: { "content-length": String(jpeg.byteLength) },
          });
        },
      },
    );
    assert(resolved.kind === "image");
    assert(typeof resolved.path === "string");
    assert(resolved.path.includes(`/${JOB_TEMP_DIRNAME}/`));
    const bytes = await Deno.readFile(resolved.path!);
    assert(bytes.byteLength === jpeg.byteLength);
    assert(bytes[0] === 0xff);
  } finally {
    await Deno.remove(destDir, { recursive: true });
  }
});

Deno.test("resolveClaimedJob maps video media_type and rejects remote URLs", async () => {
  const destDir = await Deno.makeTempDir({ prefix: `${JOB_TEMP_DIRNAME}-` });
  const nested = `${destDir}/${JOB_TEMP_DIRNAME}`;
  const blob = new Uint8Array([0, 1, 2, 3]);
  try {
    const resolved = await resolveClaimedJob(
      "https://example.supabase.co",
      "service-role",
      {
        id: JOB_ID,
        content_kind: "media",
        asset_id: ASSET_ID,
      },
      {
        destDir: nested,
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("media_assets")) {
            return new Response(
              JSON.stringify({
                storage_path: "nixes/user/clip.mp4",
                media_type: "video",
                size_bytes: blob.byteLength,
                status: "moderation_pending",
              }),
              { status: 200 },
            );
          }
          return new Response(blob, { status: 200 });
        },
      },
    );
    assert(resolved.kind === "video");
    await assertRejects(
      () =>
        resolveClaimedJob(
          "https://example.supabase.co",
          "service-role",
          {
            id: JOB_ID,
            content_kind: "media",
            asset_id: ASSET_ID,
          },
          {
            destDir: nested,
            fetchImpl: async (input) => {
              if (String(input).includes("media_assets")) {
                return new Response(
                  JSON.stringify({
                    storage_path: "https://cdn.example/clip.mp4",
                    media_type: "video",
                    size_bytes: 4,
                    status: "ready",
                  }),
                  { status: 200 },
                );
              }
              throw new Error("storage_must_not_be_called");
            },
          },
        ),
      "media_path_invalid",
    );
  } finally {
    await Deno.remove(destDir, { recursive: true });
  }
});

Deno.test("resolveClaimedJob fails closed on missing asset and oversized image", async () => {
  const destDir = await Deno.makeTempDir({ prefix: `${JOB_TEMP_DIRNAME}-` });
  const nested = `${destDir}/${JOB_TEMP_DIRNAME}`;
  try {
    await assertRejects(
      () =>
        resolveClaimedJob("https://example.supabase.co", "k", {
          content_kind: "media",
          asset_id: ASSET_ID,
        }, {
          destDir: nested,
          fetchImpl: async () => new Response("{}", { status: 404 }),
        }),
      "media_asset_load_failed",
    );
    await assertRejects(
      () =>
        resolveClaimedJob("https://example.supabase.co", "k", {
          id: JOB_ID,
          content_kind: "media",
          asset_id: ASSET_ID,
        }, {
          destDir: nested,
          fetchImpl: async (input) => {
            if (String(input).includes("media_assets")) {
              return new Response(
                JSON.stringify({
                  storage_path: "nixes/user/huge.jpg",
                  media_type: "image",
                  size_bytes: 5 * 1024 * 1024,
                  status: "ready",
                }),
                { status: 200 },
              );
            }
            throw new Error("storage_must_not_be_called");
          },
        }),
      "input_size_limit",
    );
    await assertRejects(
      () =>
        resolveClaimedJob("https://example.supabase.co", "k", {
          content_kind: "media",
          asset_id: ASSET_ID,
        }, {
          destDir: nested,
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                storage_path: "nixes/user/gone.jpg",
                media_type: "image",
                size_bytes: 12,
                status: "deleted",
              }),
              { status: 200 },
            ),
        }),
      "media_asset_unavailable",
    );
    await assertRejects(
      () =>
        resolveClaimedJob("https://example.supabase.co", "k", {
          id: JOB_ID,
          content_kind: "media",
          asset_id: ASSET_ID,
        }, {
          destDir: nested,
          fetchImpl: async (input) => {
            if (String(input).includes("media_assets")) {
              return new Response(
                JSON.stringify({
                  storage_path: "nixes/user/missing.jpg",
                  media_type: "image",
                  size_bytes: 12,
                  status: "ready",
                }),
                { status: 200 },
              );
            }
            return new Response("not found", { status: 404 });
          },
        }),
      "media_download_failed",
    );
  } finally {
    await Deno.remove(destDir, { recursive: true });
  }
});

Deno.test("removeLocalJobFile only deletes worker temp objects", async () => {
  const destDir = await Deno.makeTempDir({ prefix: `${JOB_TEMP_DIRNAME}-` });
  const nested = `${destDir}/${JOB_TEMP_DIRNAME}`;
  await Deno.mkdir(nested);
  const jobFile = `${nested}/${JOB_ID}`;
  const fixture = `${destDir}/keep.jpg`;
  await Deno.writeFile(jobFile, new Uint8Array([1]));
  await Deno.writeFile(fixture, new Uint8Array([2]));
  try {
    await removeLocalJobFile(fixture);
    await removeLocalJobFile("https://example.com/a.jpg");
    await removeLocalJobFile(jobFile);
    await Deno.stat(fixture);
    let gone = false;
    try {
      await Deno.stat(jobFile);
    } catch {
      gone = true;
    }
    assert(gone);
  } finally {
    await Deno.remove(destDir, { recursive: true });
  }
});

Deno.test("jobTempDir uses override without leaking URLs", () => {
  assert(jobTempDir("/tmp/custom").endsWith("/tmp/custom"));
});
