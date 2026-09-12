import {
  createAzureProvider,
  requireLiveWorkerEnv,
} from "./azure-provider.ts";

function assert(value: unknown, message = "assertion_failed"): asserts value {
  if (!value) throw new Error(message);
}

function assertThrows(fn: () => unknown, snippet: string): void {
  try {
    fn();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(snippet),
      `expected ${snippet}, got ${error}`,
    );
    return;
  }
  throw new Error(`expected throw ${snippet}`);
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

const SAFE: Record<string, unknown> = {
  categoriesAnalysis: [
    { category: "Hate", severity: 0 },
    { category: "SelfHarm", severity: 0 },
    { category: "Sexual", severity: 0 },
    { category: "Violence", severity: 0 },
  ],
};

Deno.test("createAzureProvider rejects missing credentials", () => {
  assertThrows(
    () => createAzureProvider({ endpoint: "", key: "x" }),
    "azure_provider_missing_credentials",
  );
});

Deno.test("analyzeText posts F0 body and counts one request", async () => {
  const urls: string[] = [];
  const provider = createAzureProvider({
    endpoint: "https://example.cognitiveservices.azure.com/",
    key: "test-key",
    gapMs: 0,
    fetchImpl: async (input, init) => {
      urls.push(String(input));
      assert(init?.method === "POST");
      const headers = new Headers(init?.headers);
      assert(headers.get("Ocp-Apim-Subscription-Key") === "test-key");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert(body.text === "hello");
      return new Response(JSON.stringify(SAFE), { status: 200 });
    },
  });
  const analysis = await provider.analyzeText(
    "hello",
    new AbortController().signal,
  );
  assert(analysis.categoriesAnalysis?.[0]?.severity === 0);
  assert(provider.azureRequestCount() === 1);
  assert(
    urls[0].includes("contentsafety/text:analyze?api-version=2024-09-01"),
  );
});

Deno.test("HTTP 429 and 5xx fail closed", async () => {
  const signal = new AbortController().signal;
  const r429 = createAzureProvider({
    endpoint: "https://example.cognitiveservices.azure.com",
    key: "k",
    gapMs: 0,
    fetchImpl: async () => new Response("nope", { status: 429 }),
  });
  await assertRejects(() => r429.analyzeText("x", signal), "provider_http_429");
  const r5xx = createAzureProvider({
    endpoint: "https://example.cognitiveservices.azure.com",
    key: "k",
    gapMs: 0,
    fetchImpl: async () => new Response("nope", { status: 503 }),
  });
  await assertRejects(
    () => r5xx.analyzeImage(new Uint8Array([1, 2, 3]), signal),
    "provider_http_5xx",
  );
});

Deno.test("oversized JPEG fails closed without calling fetch", async () => {
  let called = 0;
  const provider = createAzureProvider({
    endpoint: "https://example.cognitiveservices.azure.com",
    key: "k",
    gapMs: 0,
    fetchImpl: async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    },
  });
  const tooBig = new Uint8Array(4 * 1024 * 1024 + 1);
  await assertRejects(
    () => provider.analyzeImage(tooBig, new AbortController().signal),
    "provider_failed",
  );
  assert(called === 0);
  assert(provider.azureRequestCount() === 0);
});

Deno.test("requireLiveWorkerEnv fail-closed on missing secrets", () => {
  assertThrows(() => requireLiveWorkerEnv({}), "live_worker_missing_env");
  const ok = requireLiveWorkerEnv({
    AZURE_CONTENT_SAFETY_ENDPOINT: "https://example.cognitiveservices.azure.com",
    AZURE_CONTENT_SAFETY_KEY: "k",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "s",
    MODERATION_EXTERNAL_USED: "3630",
  });
  assert(ok.externalUsed === 3630);
});
