import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { loadProjectEnv } from '@expo/env';

const defaultProjectRoot = fileURLToPath(new URL('..', import.meta.url));

export const REQUIRED_RELEASE_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
];

export function validateReleaseEnv(env) {
  const failures = [];
  const rawUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!rawUrl) {
    failures.push('EXPO_PUBLIC_SUPABASE_URL is missing or empty');
  } else {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
        failures.push('EXPO_PUBLIC_SUPABASE_URL must be an HTTPS URL without credentials');
      }
    } catch {
      failures.push('EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS URL');
    }
  }

  if (!anonKey) failures.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing or empty');
  return failures;
}

export function formatFailures(failures) {
  return ['Release environment validation failed:', ...failures.map((failure) => `- ${failure}`)].join('\n');
}

export function runReleaseEnvValidation({ projectRoot = defaultProjectRoot, mode = 'production' } = {}) {
  loadProjectEnv(projectRoot, { mode, silent: true });
  const failures = validateReleaseEnv(process.env);
  if (failures.length > 0) {
    console.error(formatFailures(failures));
    return 1;
  }
  console.log(`Release environment validation passed for: ${REQUIRED_RELEASE_ENV.join(', ')}.`);
  return 0;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const modeIndex = process.argv.indexOf('--mode');
  const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'production';
  const rootIndex = process.argv.indexOf('--project-root');
  const projectRoot = rootIndex >= 0 ? process.argv[rootIndex + 1] : defaultProjectRoot;
  if (!projectRoot) throw new Error('--project-root requires a directory');
  process.exitCode = runReleaseEnvValidation({ mode, projectRoot: path.resolve(projectRoot) });
}
