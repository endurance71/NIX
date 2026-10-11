const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeBase64UrlJson(segment: string): unknown {
  const padded = segment.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Reads the user id from a bearer token whose signature and expiry the
 * Functions gateway has already verified (`verify_jwt = true` in config.toml).
 * This only replaces the extra GoTrue round trip of `auth.getUser()`: the
 * begin RPC still runs with the same token through PostgREST, which verifies
 * it again and authorizes with auth.uid().
 */
export function verifiedJwtSubject(token: string, nowMs = Date.now()): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  let claims: unknown;
  try {
    claims = decodeBase64UrlJson(parts[1]);
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  const { sub, role, exp } = claims as { sub?: unknown; role?: unknown; exp?: unknown };
  if (role !== 'authenticated') return null;
  if (typeof exp === 'number' && exp * 1000 <= nowMs) return null;
  return typeof sub === 'string' && UUID_PATTERN.test(sub) ? sub : null;
}

/**
 * Optional device creation time of the send (ISO string or epoch ms). Invalid
 * values are ignored rather than failing the send; the database clamps the
 * accepted value to [now() - 15 min, now()].
 */
export function parseClientCreatedAt(value: unknown): string | null {
  let date: Date;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    date = new Date(value);
  } else if (typeof value === 'string') {
    if (value.length === 0 || value.length > 64) return null;
    date = new Date(value);
  } else {
    return null;
  }
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
