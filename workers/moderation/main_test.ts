import {
  createSupabaseRpc,
  loadTextPayload,
  resolveClaimedJob,
} from "./main.ts";

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

Deno.test("resolveClaimedJob fails closed for media until storage is wired", async () => {
  await assertRejects(
    () =>
      resolveClaimedJob("https://example.supabase.co", "k", {
        content_kind: "media",
        asset_id: "a",
      }),
    "media_resolve_not_wired",
  );
});
