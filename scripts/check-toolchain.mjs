import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const expectedNode = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
const expectedDeno = readFileSync(new URL('../.deno-version', import.meta.url), 'utf8').trim();
const nodeVersion = process.versions.node;
const failures = [];

if (!nodeVersion.startsWith('24.')) {
  failures.push(`Node ${nodeVersion} is running; required ${expectedNode} (engines.node 24.x).`);
}

const deno = spawnSync('npx', ['-y', `deno@${expectedDeno}`, '--version'], {
  encoding: 'utf8',
  timeout: 60_000,
});
const denoOutput = `${deno.stdout ?? ''}${deno.stderr ?? ''}`;
if (deno.status !== 0 || !denoOutput.includes(expectedDeno)) {
  failures.push(`Deno ${expectedDeno} is required; got: ${denoOutput.trim() || deno.error?.message || 'unavailable'}`);
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`Toolchain ok: Node ${nodeVersion}, Deno ${expectedDeno}.`);
