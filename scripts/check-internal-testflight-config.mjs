import { readFile } from 'node:fs/promises';

const eas = JSON.parse(await readFile('eas.json', 'utf8'));
const workflow = await readFile('.eas/workflows/internal-testflight.yml', 'utf8');
const failures = [];
const production = eas.build?.production;
const submit = eas.submit?.production?.ios;

if (production?.environment !== 'production') failures.push('production build must use EAS environment production');
if (production?.env?.SENTRY_DISABLE_AUTO_UPLOAD !== 'true') failures.push('Sentry source-map upload must be disabled');
if (production?.env?.SENTRY_DISABLE_XCODE_DEBUG_UPLOAD !== 'true') failures.push('Sentry dSYM upload must be disabled');
if ('SENTRY_DSN' in (production?.env ?? {})) failures.push('SENTRY_DSN must not be present');
if (!/^\d{7,}$/.test(submit?.ascAppId ?? '')) failures.push('set the real numeric submit.production.ios.ascAppId before running the workflow');

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

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Internal TestFlight configuration checks passed.');
