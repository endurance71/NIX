#!/usr/bin/env node
// Reports eval results, side by side per label, or process metrics over real
// Claude Code transcripts.
//
//   node scripts/agent-evals/analyze.mjs --results baseline --results with-agents-md
//   node scripts/agent-evals/analyze.mjs --transcripts ~/.claude/projects/-Volumes-External-drive-lexar-Dev-Projects-NIX

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { evaluateRun, extractEvidence, packageDependencies, parseTrace, resolveRules, summarize } from './lib.mjs';

const evalDir = resolve(new URL('.', import.meta.url).pathname);

function pct(value) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function formatReport(resultsByLabel) {
  const lines = [
    '| wariant | runy | pass | trigger skilli | recall skilli | recall docs | 1. guidance (poz.) | naruszenia proces | naruszenia kod | koszt |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const [label, runs] of Object.entries(resultsByLabel)) {
    const s = summarize(runs);
    lines.push(`| ${label} | ${s.runs} | ${pct(s.passRate)} | ${pct(s.triggerRate)} | ${pct(s.skillRecall)} | ${pct(s.docRecall)} | ${s.firstGuidancePosition === null ? '—' : s.firstGuidancePosition.toFixed(2)} | ${s.processViolations} | ${s.uptakeViolations} | $${s.costUsd.toFixed(2)} |`);
  }
  for (const [label, runs] of Object.entries(resultsByLabel)) {
    lines.push('', `### ${label}`);
    for (const run of runs) {
      lines.push(`- **${run.scenario}#${run.run ?? 1}** ${run.pass ? 'PASS' : 'FAIL'} — skills: ${run.skillsLoaded.join(', ') || '—'}; docs: ${run.docsRead.join(', ') || '—'}`);
      for (const v of run.violations) lines.push(`  - ✗ [${v.layer}] ${v.why}: \`${v.detail}\``);
      for (const u of run.unmet) lines.push(`  - ○ ${u}`);
    }
  }
  return lines.join('\n');
}

// --rescore re-evaluates saved traces and diffs against the current
// scenarios.json, so fixing a wrong ground truth does not need paid re-runs.
function rescore(dir) {
  const config = JSON.parse(readFileSync(join(evalDir, 'scenarios.json'), 'utf8'));
  const dependencies = packageDependencies(JSON.parse(readFileSync(join(evalDir, '../../package.json'), 'utf8')));
  return readdirSync(dir)
    .filter((file) => file.endsWith('.trace.jsonl'))
    .sort()
    .flatMap((file) => {
      const [id, run] = file.replace('.trace.jsonl', '').split('.');
      const scenario = config.scenarios.find((item) => item.id === id);
      if (!scenario) return [];
      const diffPath = join(dir, file.replace('.trace.jsonl', '.diff'));
      const trace = parseTrace(readFileSync(join(dir, file), 'utf8'));
      const diff = existsSync(diffPath) ? readFileSync(diffPath, 'utf8') : '';
      return [{ ...evaluateRun({ scenario, ruleSets: config.ruleSets, trace, diff, dependencies }), run: Number(run) }];
    });
}

function loadResults(label, { fresh = false } = {}) {
  const dir = existsSync(label) ? label : join(evalDir, 'results', label);
  if (fresh) return rescore(dir);
  const file = join(dir, 'summary.json');
  if (!existsSync(file)) throw new Error(`No summary.json in ${dir}`);
  return JSON.parse(readFileSync(file, 'utf8')).results;
}

function analyzeTranscripts(dir) {
  const config = JSON.parse(readFileSync(join(evalDir, 'scenarios.json'), 'utf8'));
  const docs = [...new Set(config.scenarios.flatMap((scenario) => scenario.expectedDocs ?? []))];
  const { forbiddenCommands } = resolveRules({ id: 'transcripts', rules: Object.keys(config.ruleSets) }, config.ruleSets);
  const skillCounts = new Map();
  const docCounts = new Map();
  const violations = [];
  let sessions = 0;
  let withSkill = 0;
  let withDoc = 0;

  for (const name of readdirSync(dir).filter((file) => file.endsWith('.jsonl'))) {
    const { calls } = parseTrace(readFileSync(join(dir, name), 'utf8'));
    if (calls.length < 3) continue;
    sessions += 1;
    const evidence = extractEvidence(calls, docs);
    if (evidence.skills.length) withSkill += 1;
    if (evidence.docsRead.length) withDoc += 1;
    for (const skill of evidence.skills) skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
    for (const doc of evidence.docsRead) docCounts.set(doc, (docCounts.get(doc) ?? 0) + 1);
    for (const rule of forbiddenCommands) {
      const re = new RegExp(rule.pattern);
      for (const command of evidence.commands) if (re.test(command)) violations.push(`${name}: ${rule.why} — \`${command.slice(0, 120)}\``);
    }
  }

  const top = (map) => [...map].sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} (${count})`).join(', ') || '—';
  return [
    `Sesje (≥3 wywołania narzędzi): ${sessions}`,
    `Sesje z załadowanym skillem: ${withSkill} (${pct(sessions ? withSkill / sessions : null)})`,
    `Sesje, które przeczytały kluczowy doc: ${withDoc} (${pct(sessions ? withDoc / sessions : null)})`,
    `Skille: ${top(skillCounts)}`,
    `Docs: ${top(docCounts)}`,
    `Naruszenia zasad procesu: ${violations.length}`,
    ...violations.map((violation) => `  - ${violation}`),
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values: args } = parseArgs({
    options: { results: { type: 'string', multiple: true }, transcripts: { type: 'string' }, rescore: { type: 'boolean', default: false } },
  });
  if (args.transcripts) {
    console.log(analyzeTranscripts(resolve(args.transcripts.replace(/^~/, process.env.HOME))));
  } else if (args.results?.length) {
    console.log(formatReport(Object.fromEntries(args.results.map((label) => [label, loadResults(label, { fresh: args.rescore })]))));
  } else {
    console.error('Usage: analyze.mjs --results <label> [--results <label>] [--rescore] | --transcripts <dir>');
    process.exit(1);
  }
}
