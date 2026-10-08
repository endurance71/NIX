/** Reject libpq connection-string database names as well as remote addresses. */
export function parseLocalTypeDatabase(address) {
  if (!address) throw new Error('Set NIX_TYPES_DB_URL to a migrated local database');
  const url = new URL(address);
  const database = decodeURIComponent(url.pathname.slice(1) || 'postgres');
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !['54322', '15439', '15532', '15432'].includes(url.port)
    || url.search || url.hash || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(database)) {
    throw new Error('Database type generation requires an explicit local target and a plain database name');
  }
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port: url.port,
    user: decodeURIComponent(url.username || 'postgres'), password: decodeURIComponent(url.password), database };
}
