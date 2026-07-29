import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const testsDirectory = join(process.cwd(), 'supabase', 'tests');

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTests(path);
      return /\.(sql|pg)$/.test(entry.name) ? [path] : [];
    })
    .sort();
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    ...options,
  });
}

const testFiles = collectTests(testsDirectory);
if (testFiles.length === 0) {
  throw new Error('No Supabase database tests were found.');
}

const official = run('npx', ['supabase', 'test', 'db']);
const officialOutput = `${official.stdout ?? ''}${official.stderr ?? ''}`;
process.stdout.write(officialOutput);

if (official.status === 0 && !officialOutput.includes('Result: NOTESTS')) {
  process.exit(0);
}
if (!officialOutput.includes('Result: NOTESTS')) {
  process.exit(official.status ?? 1);
}

// Docker Desktop can expose an external-volume project to the Supabase CLI
// while leaving its bind-mounted tests directory empty. Run the same
// transactional SQL directly in the already-running local Postgres container.
const config = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8');
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId) throw new Error('Could not resolve project_id from supabase/config.toml.');

const container = `supabase_db_${projectId}`;
process.stdout.write(`Falling back to direct pgTAP execution in ${container}.\n`);

for (const testFile of testFiles) {
  const result = run(
    'docker',
    ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    { input: readFileSync(testFile, 'utf8') }
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(`${basename(testFile)}\n${output}`);

  const tapFailure =
    /(^|\n)\s*not ok\b/m.test(output) ||
    /Looks like you planned \d+ tests but ran \d+/i.test(output);
  if (result.status !== 0 || tapFailure) process.exit(result.status || 1);
}

process.stdout.write(`Supabase database tests passed (${testFiles.length} file).\n`);
