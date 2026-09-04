/**
 * Shared libpq-safe env for spawning psql (and similar clients).
 * Strips all inherited PG* variables so PGHOSTADDR/PGSERVICE/PGHOST cannot
 * redirect connections away from explicit -h/-p/-U/-d args.
 */

/**
 * @param {string} password
 * @param {NodeJS.ProcessEnv} [baseEnv]
 * @returns {NodeJS.ProcessEnv}
 */
export function buildSafePsqlEnv(password, baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (key.startsWith("PG")) {
      delete env[key];
    }
  }
  env.PGPASSWORD = password;
  return env;
}

/**
 * Minimal env for spawning child Node processes that themselves call safe psql.
 * Strips PG*, keeps PATH/HOME/TMPDIR and selected allowlisted keys.
 * @param {Record<string, string | undefined>} extras
 * @param {NodeJS.ProcessEnv} [baseEnv]
 */
export function buildStrippedChildEnv(extras = {}, baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (key.startsWith("PG")) {
      delete env[key];
    }
  }
  for (const [k, v] of Object.entries(extras)) {
    if (v === undefined || v === null) {
      delete env[k];
    } else {
      env[k] = String(v);
    }
  }
  return env;
}
