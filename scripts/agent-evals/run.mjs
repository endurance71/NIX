#!/usr/bin/env node
// Runs eval scenarios headlessly with `claude -p`, one fresh git worktree per
// run, and records the trajectory (stream-json) plus the resulting diff.
//
//   node scripts/agent-evals/run.mjs --label with-agents-md
//   node scripts/agent-evals/run.mjs --label baseline --instructions none --scenario ui-privacy-toggle --runs 3
//
// Installs, deploys, commits and pushes are denied by permissions — the
// attempt still lands in the trace, which is what the process checks score.

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { evaluateRun, packageDependencies, parseTrace, summarize } from './lib.mjs';
import { formatReport } from './analyze.mjs';

const repoRoot = resolve(new URL('../..', import.meta.url).pathname);
const evalDir = join(repoRoot, 'scripts/agent-evals');

const { values: args } = parseArgs({
  options: {
    label: { type: 'string', default: 'default' },
    scenario: { type: 'string', multiple: true },
    runs: { type: 'string', default: '1' },
    instructions: { type: 'string', default: 'worktree' },
    model: { type: 'string' },
    settings: { type: 'string' },
    'plugin-dir': { type: 'string', multiple: true },
    'max-budget-usd': { type: 'string', default: '2' },
    'timeout-min': { type: 'string', default: '20' },
    isolated: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
  },
});

// Agent-facing instruction files: copied from the working tree so uncommitted
// edits can be evaluated before they land (the PR-vs-main comparison).
const INSTRUCTION_PATHS = ['AGENTS.md', 'CLAUDE.md', '.claude/skills', '.claude/settings.json', '.cursor/rules'];
const ENTRYPOINT_PATHS = ['AGENTS.md', 'CLAUDE.md', '.claude/skills', '.claude/settings.json'];

const ALLOWED_TOOLS = [
  'Read', 'Glob', 'Grep', 'Edit', 'Write', 'Skill', 'Agent',
  'Bash(npm run:*)', 'Bash(npm test:*)', 'Bash(npx tsc:*)', 'Bash(git diff:*)', 'Bash(git status:*)', 'Bash(git log:*)',
  'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)', 'Bash(rg:*)', 'Bash(find:*)', 'Bash(sed -n:*)', 'Bash(wc:*)',
];
const DISALLOWED_TOOLS = [
  'Bash(eas:*)', 'Bash(npx eas:*)', 'Bash(npx eas-cli:*)', 'Bash(npx -y eas-cli:*)', 'Bash(npx expo install:*)', 'Bash(npm install:*)', 'Bash(npm i:*)', 'Bash(npm add:*)',
  'Bash(yarn:*)', 'Bash(pnpm:*)', 'Bash(bun:*)', 'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(supabase:*)', 'Bash(npx supabase:*)',
];

function git(cwd, ...gitArgs) {
  const result = spawnSync('git', gitArgs, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${gitArgs.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function prepareWorktree(dir) {
  git(repoRoot, 'worktree', 'add', '--detach', dir, 'HEAD');
  symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'));
  if (args.instructions === 'worktree') {
    for (const path of INSTRUCTION_PATHS) {
      if (existsSync(join(repoRoot, path))) cpSync(join(repoRoot, path), join(dir, path), { recursive: true });
    }
  } else if (args.instructions === 'none') {
    for (const path of ENTRYPOINT_PATHS) rmSync(join(dir, path), { recursive: true, force: true });
  } else if (args.instructions.startsWith('ref:')) {
    // Same code, instructions as of another ref (e.g. ref:origin/main in CI).
    const ref = args.instructions.slice('ref:'.length);
    for (const path of INSTRUCTION_PATHS) rmSync(join(dir, path), { recursive: true, force: true });
    const present = INSTRUCTION_PATHS.filter((path) => spawnSync('git', ['cat-file', '-e', `${ref}:${path}`], { cwd: repoRoot }).status === 0);
    if (present.length) git(dir, 'checkout', ref, '--', ...present);
    git(dir, 'reset', '-q');
  } else if (args.instructions !== 'head') {
    throw new Error(`--instructions must be worktree|head|none|ref:<git-ref>, got ${args.instructions}`);
  }
}

function collectDiff(dir) {
  const exclude = ['node_modules', ...INSTRUCTION_PATHS].map((path) => `:(exclude)${path}`);
  git(dir, 'add', '-A', '--', '.', ...exclude);
  return git(dir, 'diff', '--cached', 'HEAD', '--', '.', ...exclude);
}

function runClaude(dir, prompt, tracePath) {
  const claudeArgs = [
    '-p', prompt,
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--no-session-persistence',
    '--max-budget-usd', args['max-budget-usd'],
    '--allowedTools', ...ALLOWED_TOOLS,
    '--disallowedTools', ...DISALLOWED_TOOLS,
  ];
  if (args.model) claudeArgs.push('--model', args.model);
  if (args.settings) claudeArgs.push('--settings', resolve(args.settings));
  for (const pluginDir of args['plugin-dir'] ?? []) claudeArgs.push('--plugin-dir', resolve(pluginDir));
  // Default keeps the real environment (user skills, MCP servers): skill
  // discovery depends on how crowded the catalog is, so the env is part of the eval.
  if (args.isolated) claudeArgs.push('--strict-mcp-config');

  return new Promise((resolvePromise) => {
    const out = createWriteStream(tracePath);
    const child = spawn('claude', claudeArgs, { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), Number(args['timeout-min']) * 60_000);
    child.stdout.pipe(out);
    child.on('close', (code) => {
      clearTimeout(timer);
      out.end(() => resolvePromise(code));
    });
  });
}

const config = JSON.parse(readFileSync(join(evalDir, 'scenarios.json'), 'utf8'));
const dependencies = packageDependencies(JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')));
const selected = args.scenario?.length
  ? config.scenarios.filter((scenario) => args.scenario.includes(scenario.id))
  : config.scenarios;
if (!selected.length) throw new Error(`No scenarios match ${args.scenario}`);

const outDir = join(evalDir, 'results', args.label);
mkdirSync(outDir, { recursive: true });
const results = [];

for (const scenario of selected) {
  for (let n = 1; n <= Number(args.runs); n += 1) {
    const runId = `${scenario.id}.${n}`;
    const dir = join(tmpdir(), 'nix-agent-evals', `${args.label}-${runId}-${Date.now()}`);
    mkdirSync(join(dir, '..'), { recursive: true });
    console.error(`▶ [${args.label}] ${runId}`);
    prepareWorktree(dir);
    try {
      const tracePath = join(outDir, `${runId}.trace.jsonl`);
      const exitCode = await runClaude(dir, scenario.prompt, tracePath);
      const diff = collectDiff(dir);
      writeFileSync(join(outDir, `${runId}.diff`), diff);
      const trace = parseTrace(readFileSync(tracePath, 'utf8'));
      const result = { ...evaluateRun({ scenario, ruleSets: config.ruleSets, trace, diff, dependencies }), run: n, exitCode };
      writeFileSync(join(outDir, `${runId}.json`), JSON.stringify(result, null, 2));
      results.push(result);
      console.error(`  ${result.pass ? 'PASS' : 'FAIL'} · skills: ${result.skillsLoaded.join(', ') || '—'} · docs: ${result.docsRead.length}/${scenario.expectedDocs?.length ?? 0}`);
    } finally {
      if (args.keep) console.error(`  worktree kept: ${dir}`);
      else git(repoRoot, 'worktree', 'remove', '--force', dir);
    }
  }
}

writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ label: args.label, instructions: args.instructions, summary: summarize(results), results }, null, 2));
console.log(formatReport({ [args.label]: results }));
