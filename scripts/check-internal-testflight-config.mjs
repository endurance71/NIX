import { readFile } from 'node:fs/promises';

const eas = JSON.parse(await readFile('eas.json', 'utf8'));
const appConfig = JSON.parse(await readFile('app.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const workflow = await readFile('.eas/workflows/internal-testflight.yml', 'utf8');
const productionEnv = await readFile('.env.production', 'utf8');
const failures = [];
const production = eas.build?.production;
const submit = eas.submit?.production?.ios;

if (eas.cli?.appVersionSource !== 'local') failures.push('EAS appVersionSource must be local for the 1.0.10 (1) RC');
if (production?.environment !== 'production') failures.push('production build must use EAS environment production');
if (production?.channel !== 'production') failures.push('production build must use the production OTA channel');
if (production?.autoIncrement !== false) failures.push('production build autoIncrement must be false for the 1.0.10 (1) RC');
if (eas.build?.preview?.channel !== 'preview') failures.push('preview build must use the preview OTA channel');
if (eas.build?.development?.channel !== 'development') failures.push('development build must use the development OTA channel');
if (production?.env?.SENTRY_DISABLE_AUTO_UPLOAD !== 'true') failures.push('Sentry source-map upload must be disabled');
if (production?.env?.SENTRY_DISABLE_XCODE_DEBUG_UPLOAD !== 'true') failures.push('Sentry dSYM upload must be disabled');
if ('SENTRY_DSN' in (production?.env ?? {})) failures.push('SENTRY_DSN must not be present');
if (!/^\d{7,}$/.test(submit?.ascAppId ?? '')) failures.push('set the real numeric submit.production.ios.ascAppId before running the workflow');
if (pkg.version !== '1.0.10') failures.push('package.json version must be 1.0.10');
if (appConfig.expo?.version !== '1.0.10') failures.push('app.json expo.version must be 1.0.10');
if (appConfig.expo?.runtimeVersion !== '1.0.10') failures.push('app.json expo.runtimeVersion must be 1.0.10');
if (appConfig.expo?.ios?.buildNumber !== '1') failures.push('app.json expo.ios.buildNumber must be 1');
if (appConfig.expo?.updates?.requestHeaders?.['expo-channel-name'] !== 'production') {
  failures.push('app.json must point updates at the production channel');
}

for (const marker of [
  'type: require-approval',
  "internal_groups: ['NiX Internal QA']",
  'submit_beta_review: false',
  'npm run check:sentry-disabled',
  'npm run check:supabase-migrations',
]) {
  if (!workflow.includes(marker)) failures.push(`internal workflow is missing: ${marker}`);
}
if (/external_groups:/i.test(workflow)) failures.push('internal workflow must not contain external groups');
if (!/^EXPO_PUBLIC_SHARE_INVITES_ENABLED=false$/m.test(productionEnv)) {
  failures.push('shared invite links must remain explicitly disabled for the current internal build');
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Internal TestFlight configuration checks passed.');
