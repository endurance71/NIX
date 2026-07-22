import { getBearerToken } from './http.ts';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** True when Authorization bearer is the service-role key or a service_role JWT. */
export function hasServiceRoleBearer(req: Request, serviceRoleKey: string | undefined) {
  const token = getBearerToken(req);
  if (!token) return false;
  if (serviceRoleKey && token === serviceRoleKey) return true;

  // Edge runtime may inject a rotated service-role material that no longer
  // byte-matches the legacy JWT still accepted by the Functions gateway.
  // After gateway JWT verification, accept explicit service_role claims.
  const payload = decodeJwtPayload(token);
  return payload?.role === 'service_role' && payload?.iss === 'supabase';
}
