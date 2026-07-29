import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { getBearerToken, json } from '../_shared/http.ts';
import {
  DATA_EXPORT_SIGNED_URL_TTL_SECONDS,
  isExportReadyForDownload,
  isRecentAuthentication,
} from '../_shared/data-export.ts';

function jwtIssuedAt(token: string): number | null {
  try {
    const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded)) as { iat?: unknown };
    return typeof decoded.iat === 'number' ? decoded.iat : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = getBearerToken(req);
  if (!url || !anonKey || !serviceKey) {
    return json({ error: 'SERVER_CONFIG_MISSING', code: 'SERVER_CONFIG_MISSING' }, 500);
  }
  if (!token) return json({ error: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED' }, 401);

  // Downloading an account archive is a sensitive action. Require a session
  // issued during a recent sign-in/reauthentication, not merely a valid old JWT.
  const issuedAt = jwtIssuedAt(token);
  if (!isRecentAuthentication(issuedAt)) {
    return json({ error: 'REAUTH_REQUIRED', code: 'REAUTH_REQUIRED' }, 401);
  }

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) return json({ error: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED' }, 401);

  let body: { job_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BODY', code: 'INVALID_BODY' }, 400);
  }
  if (typeof body.job_id !== 'string') {
    return json({ error: 'INVALID_JOB', code: 'INVALID_JOB' }, 400);
  }

  const service = createClient(url, serviceKey);
  const { data: job, error: jobError } = await service
    .from('data_export_jobs')
    .select('storage_path,status,expires_at')
    .eq('id', body.job_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (jobError) return json({ error: 'EXPORT_LOOKUP_FAILED', code: 'EXPORT_LOOKUP_FAILED' }, 500);
  if (!isExportReadyForDownload(job)) {
    return json({ error: 'EXPORT_NOT_AVAILABLE', code: 'EXPORT_NOT_AVAILABLE' }, 404);
  }

  const { data, error } = await service.storage
    .from('account-exports')
    .createSignedUrl(job.storage_path, DATA_EXPORT_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return json({ error: 'SIGNED_URL_FAILED', code: 'SIGNED_URL_FAILED' }, 500);
  }
  return json({ signed_url: data.signedUrl, expires_in: DATA_EXPORT_SIGNED_URL_TTL_SECONDS });
});
