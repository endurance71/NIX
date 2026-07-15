import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'npx',
  ['-y', 'supabase@latest', 'db', 'lint', '--local', '--level', 'warning'],
  { cwd: process.cwd(), encoding: 'utf8' }
);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
if (output) console.log(output);

if (result.error) {
  console.error(`Could not run Supabase DB lint: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

const jsonLine = output
  .split(/\r?\n/)
  .reverse()
  .find((line) => line.trimStart().startsWith('{'));

if (!jsonLine) {
  console.error('Supabase DB lint did not return its JSON result.');
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(jsonLine);
} catch (error) {
  console.error(`Could not parse Supabase DB lint result: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(payload.results)) {
  console.error('Supabase DB lint returned an unexpected result shape.');
  process.exit(1);
}
if (payload.results.length > 0) {
  console.error(`Supabase DB lint reported ${payload.results.length} finding(s).`);
  process.exit(1);
}

console.log('Supabase DB lint passed with zero findings.');
