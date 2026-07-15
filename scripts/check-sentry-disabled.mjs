import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

export function sentryDisabledViolations() {
  const packageJson = JSON.parse(read('package.json'));
  const app = JSON.parse(read('app.json')).expo;
  const eas = JSON.parse(read('eas.json'));
  const monitoring = read('src/lib/monitoring.ts');
  const layout = read('src/app/_layout.tsx');
  const edgeHttp = read('supabase/functions/_shared/http.ts');
  const xcodeEnv = read('ios/.xcode.env');
  const xcodeProject = read('ios/NiX.xcodeproj/project.pbxproj');
  const violations = [];

  if (packageJson.dependencies?.['@sentry/react-native'] !== '~7.11.0') {
    violations.push('the pinned @sentry/react-native SDK must remain installed');
  }
  if (!app.plugins?.includes('@sentry/react-native')) {
    violations.push('the Expo Sentry plugin must remain configured for a later rollout');
  }
  const exportCommand = packageJson.scripts?.['export:production'] ?? '';
  if (
    !exportCommand.includes('SENTRY_DISABLE_AUTO_UPLOAD=true') ||
    !exportCommand.includes('SENTRY_DISABLE_XCODE_DEBUG_UPLOAD=true')
  ) {
    violations.push('the local production export does not hard-disable Sentry uploads');
  }
  if (!monitoring.includes('const SENTRY_RUNTIME_ENABLED = false;')) {
    violations.push('the app runtime hard-off flag is missing');
  }
  if (layout.includes('Sentry.wrap(')) {
    violations.push('the root layout must not be wrapped by Sentry while monitoring is disabled');
  }
  if (!edgeHttp.includes('const SENTRY_RUNTIME_ENABLED = false;')) {
    violations.push('the Edge Function hard-off flag is missing');
  }

  for (const profile of ['development', 'preview', 'production']) {
    const env = eas.build?.[profile]?.env;
    if (env?.SENTRY_DISABLE_AUTO_UPLOAD !== 'true') {
      violations.push(`${profile} does not disable Sentry source-map uploads`);
    }
    if (env?.SENTRY_DISABLE_XCODE_DEBUG_UPLOAD !== 'true') {
      violations.push(`${profile} does not disable Sentry dSYM uploads`);
    }
  }

  for (const marker of [
    'export SENTRY_DISABLE_AUTO_UPLOAD=true',
    'export SENTRY_DISABLE_XCODE_DEBUG_UPLOAD=true',
  ]) {
    if (!xcodeEnv.includes(marker)) violations.push(`ios/.xcode.env is missing: ${marker}`);
    if (!xcodeProject.includes(marker)) {
      violations.push(`the standalone Xcode debug-symbol phase is missing: ${marker}`);
    }
  }

  return violations;
}

export function assertSentryDisabled() {
  const violations = sentryDisabledViolations();
  if (violations.length) {
    for (const violation of violations) console.error(`Sentry hard-off: ${violation}`);
    return false;
  }
  console.log('Sentry runtime, Edge transport, source maps and dSYM uploads are hard-disabled.');
  return true;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  if (!assertSentryDisabled()) process.exit(1);
}
