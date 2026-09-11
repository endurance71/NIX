import {
  decideFromProviderAnalysis,
  decisionFromHttpStatus,
  worsePolicyResult,
  type PolicyResult,
  type ProviderAnalysis,
} from './moderation-policy.ts';

const API_VERSION = '2024-09-01';

export type AzureAnalyzeResult =
  | { ok: true; analysis: ProviderAnalysis; operationId: string | null }
  | { ok: false; retryable: boolean; status: number | null; operationId: string | null };

function endpointBase(): string | null {
  return Deno.env.get('AZURE_CONTENT_SAFETY_ENDPOINT')?.replace(/\/+$/, '') ?? null;
}

function apiKey(): string | null {
  return Deno.env.get('AZURE_CONTENT_SAFETY_KEY') ?? null;
}

export function azureConfigured(): boolean {
  return Boolean(endpointBase() && apiKey());
}

async function postJson(path: string, body: Record<string, unknown>): Promise<Response> {
  const endpoint = endpointBase();
  const key = apiKey();
  if (!endpoint || !key) {
    return new Response(JSON.stringify({ error: 'missing_config' }), { status: 500 });
  }
  return fetch(`${endpoint}${path}?api-version=${API_VERSION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': key,
    },
    body: JSON.stringify(body),
  });
}

export async function analyzeText(text: string): Promise<AzureAnalyzeResult> {
  const response = await postJson('/contentsafety/text:analyze', {
    text,
    categories: ['Hate', 'SelfHarm', 'Sexual', 'Violence'],
  });
  const operationId = response.headers.get('apim-request-id');
  if (!response.ok) {
    const retryable = decisionFromHttpStatus(response.status) === 'error' && response.status >= 429;
    return { ok: false, retryable, status: response.status, operationId };
  }
  const payload = await response.json() as ProviderAnalysis;
  return { ok: true, analysis: payload, operationId };
}

export async function analyzeImageBase64(base64: string): Promise<AzureAnalyzeResult> {
  const response = await postJson('/contentsafety/image:analyze', {
    image: { content: base64 },
    categories: ['Hate', 'SelfHarm', 'Sexual', 'Violence'],
  });
  const operationId = response.headers.get('apim-request-id');
  if (!response.ok) {
    const retryable = decisionFromHttpStatus(response.status) === 'error' && response.status >= 429;
    return { ok: false, retryable, status: response.status, operationId };
  }
  const payload = await response.json() as ProviderAnalysis;
  return { ok: true, analysis: payload, operationId };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decideAnalysis(analysis: ProviderAnalysis | null | undefined) {
  return decideFromProviderAnalysis(analysis, { humanReviewEnabled: false });
}

export function combineFrameDecisions(results: PolicyResult[]): PolicyResult {
  if (results.length === 0) {
    return decideFromProviderAnalysis(null, { humanReviewEnabled: false });
  }
  return results.reduce((acc, next) => worsePolicyResult(acc, next));
}
