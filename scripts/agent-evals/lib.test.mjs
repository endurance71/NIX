import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { evaluateRun, extractEvidence, missingImports, parseDiff, parseTrace, skillName, summarize } from './lib.mjs';

const config = JSON.parse(readFileSync(new URL('./scenarios.json', import.meta.url), 'utf8'));
const scenario = (id) => config.scenarios.find((item) => item.id === id);

function traceOf(...calls) {
  const answer = typeof calls.at(-1) === 'string' ? calls.pop() : '';
  const lines = calls.map(([name, input]) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } }));
  lines.push(JSON.stringify({ type: 'result', total_cost_usd: 0.42, num_turns: 3, result: answer }));
  return parseTrace(lines.join('\n'));
}

const NEW_I18N_DIFF = [
  'diff --git a/src/lib/i18n.ts b/src/lib/i18n.ts',
  'index 1..2 100644',
  '--- a/src/lib/i18n.ts',
  '+++ b/src/lib/i18n.ts',
  "+      privacy: 'Prywatność',",
  'diff --git a/src/components/profile/PrivacySection.tsx b/src/components/profile/PrivacySection.tsx',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/components/profile/PrivacySection.tsx',
  "+import { Toggle } from '@expo/ui';",
].join('\n');

test('every scenario references known rule sets and valid regexes', () => {
  for (const item of config.scenarios) {
    for (const rule of item.rules ?? []) assert.ok(config.ruleSets[rule], `${item.id}: ${rule}`);
    for (const pattern of [...(item.requiredChangedFiles ?? []), ...(item.expectedCommands ?? [])]) new RegExp(pattern);
  }
  for (const set of Object.values(config.ruleSets)) {
    for (const rule of [...(set.forbiddenCommands ?? []), ...(set.forbiddenCode ?? [])]) new RegExp(rule.pattern);
  }
});

test('parseTrace collects tool calls and the result event', () => {
  const trace = traceOf(['Skill', { skill: 'expo:expo-ui' }], ['Bash', { command: 'ls' }]);
  assert.equal(trace.calls.length, 2);
  assert.equal(trace.result.costUsd, 0.42);
  assert.equal(skillName('expo:expo-ui'), 'expo-ui');
});

test('extractEvidence finds docs read via Read or Bash and the first guidance position', () => {
  const trace = traceOf(['Glob', { pattern: 'src/**' }], ['Bash', { command: 'sed -n 1,80p docs/theme-guidelines.md' }], ['Read', { file_path: '/wt/docs/i18n-guidelines.md' }]);
  const evidence = extractEvidence(trace.calls, ['docs/theme-guidelines.md', 'docs/i18n-guidelines.md', 'docs/video-pipeline.md']);
  assert.deepEqual(evidence.docsRead.sort(), ['docs/i18n-guidelines.md', 'docs/theme-guidelines.md']);
  assert.equal(evidence.firstGuidancePosition, 1 / 3);
});

test('parseDiff tracks status and added lines', () => {
  const files = parseDiff(NEW_I18N_DIFF);
  assert.deepEqual(files.map((file) => [file.path, file.status]), [
    ['src/lib/i18n.ts', 'modified'],
    ['src/components/profile/PrivacySection.tsx', 'added'],
  ]);
  assert.equal(files[1].addedLines.length, 1);
});

test('native-first run that follows the guidance passes', () => {
  const trace = traceOf(['Read', { file_path: 'docs/native-platform-guidelines.md' }], ['Bash', { command: 'npm run typecheck' }]);
  const result = evaluateRun({ scenario: scenario('ui-privacy-toggle'), ruleSets: config.ruleSets, trace, diff: NEW_I18N_DIFF });
  assert.equal(result.pass, true, JSON.stringify(result));
  assert.equal(result.docRecall, 1 / 3);
  assert.equal(result.skillRecall, 0);
});

test('uptake violations are reported only for matching paths', () => {
  const diff = [
    'diff --git a/src/components/X.tsx b/src/components/X.tsx',
    '+++ b/src/components/X.tsx',
    "+import { Animated, SafeAreaView } from 'react-native';",
    "+const c = '#FF0000';",
    'diff --git a/src/theme/colors.ts b/src/theme/colors.ts',
    '+++ b/src/theme/colors.ts',
    "+  accent: '#0A84FF',",
  ].join('\n');
  const result = evaluateRun({ scenario: scenario('ui-privacy-toggle'), ruleSets: config.ruleSets, trace: traceOf(), diff });
  const whys = result.violations.map((violation) => violation.why);
  assert.ok(whys.some((why) => why.includes('Animated')));
  assert.ok(whys.some((why) => why.includes('SafeAreaView')));
  assert.equal(result.violations.filter((violation) => violation.detail.includes('colors.ts')).length, 0);
  assert.equal(result.pass, false);
});

test('process violations: eas build and npm install of an Expo package', () => {
  const trace = traceOf(['Bash', { command: 'npm install expo-clipboard' }], ['Bash', { command: 'eas build -p ios' }]);
  const result = evaluateRun({ scenario: scenario('copy-friend-code'), ruleSets: config.ruleSets, trace, diff: '' });
  assert.equal(result.violations.filter((violation) => violation.layer === 'process').length, 2);
  assert.ok(result.unmet.some((item) => item.includes('expo-clipboard')));
});

test('hotfix scenario accepts a justified OTA hold and rejects a silent answer', () => {
  const read = ['Read', { file_path: 'docs/DEPLOY_IOS_TESTFLIGHT.md' }];
  const hold = evaluateRun({ scenario: scenario('hotfix-to-testers'), ruleSets: config.ruleSets, trace: traceOf(read, 'Nie publikuję OTA dla runtime 1.0.12 bez Twojej decyzji.'), diff: '' });
  assert.equal(hold.pass, true, JSON.stringify(hold));
  const silent = evaluateRun({ scenario: scenario('hotfix-to-testers'), ruleSets: config.ruleSets, trace: traceOf(read, 'Gotowe.'), diff: '' });
  assert.equal(silent.pass, false);
});

test('editing an existing migration violates protectedPaths, adding one does not', () => {
  const diff = [
    'diff --git a/supabase/migrations/20261010120000_pre_review_hardening.sql b/supabase/migrations/20261010120000_pre_review_hardening.sql',
    '+++ b/supabase/migrations/20261010120000_pre_review_hardening.sql',
    '+alter table x add column y int;',
    'diff --git a/supabase/migrations/20261011090000_mute_friend.sql b/supabase/migrations/20261011090000_mute_friend.sql',
    'new file mode 100644',
    '+++ b/supabase/migrations/20261011090000_mute_friend.sql',
    '+alter table friendships add column muted_until timestamptz;',
  ].join('\n');
  const result = evaluateRun({ scenario: scenario('friend-nickname-schema'), ruleSets: config.ruleSets, trace: traceOf(['Skill', { skill: 'supabase' }]), diff });
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0].detail, /pre_review_hardening/);
  assert.equal(result.skillRecall, 0.5);
  assert.equal(result.triggered, true);
});

test('noChanges scenario fails when the agent edits code', () => {
  const result = evaluateRun({ scenario: scenario('investigate-upload-stall'), ruleSets: config.ruleSets, trace: traceOf(), diff: NEW_I18N_DIFF });
  assert.equal(result.pass, false);
});

test('catalog from the init event marks expected skills the agent could not see', () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', skills: ['expo:expo-ui', 'supabase'], plugins: [{ name: 'expo' }] }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'expo:expo-ui' } }] } }),
  ];
  const trace = parseTrace(lines.join('\n'));
  assert.deepEqual(trace.catalog, { skills: ['expo-ui', 'supabase'], plugins: ['expo'] });
  const result = evaluateRun({ scenario: scenario('ui-privacy-toggle'), ruleSets: config.ruleSets, trace, diff: NEW_I18N_DIFF });
  assert.equal(result.skillRecall, 0.5);
  assert.deepEqual(result.unavailableSkills, ['expo-native-ui']);
  assert.equal(result.catalogSize, 2);
});

test('summarize aggregates rates', () => {
  const runs = [
    { pass: true, triggered: true, skillRecall: 1, docRecall: null, firstGuidancePosition: 0, violations: [], costUsd: 1 },
    { pass: false, triggered: false, skillRecall: 0, docRecall: 0.5, firstGuidancePosition: null, violations: [{ layer: 'process' }], costUsd: 0.5 },
  ];
  const summary = summarize(runs);
  assert.equal(summary.passRate, 0.5);
  assert.equal(summary.skillRecall, 0.5);
  assert.equal(summary.docRecall, 0.5);
  assert.equal(summary.processViolations, 1);
  assert.equal(summary.costUsd, 1.5);
});

test('missingImports flags uninstalled packages but not aliases, relatives or packages added in the diff', () => {
  const diff = [
    'diff --git a/src/app/friend-my-code.tsx b/src/app/friend-my-code.tsx',
    '+++ b/src/app/friend-my-code.tsx',
    "+import * as Clipboard from 'expo-clipboard';",
    "+import { Host } from '@expo/ui/swift-ui';",
    "+import { notify } from '../lib/appNotify';",
    "+import { useAppTheme } from '@/hooks/useAppTheme';",
    "+const share = await import('expo-sharing');",
  ].join('\n');
  const files = parseDiff(diff);
  assert.deepEqual(missingImports(files, ['@expo/ui']), ['src/app/friend-my-code.tsx: expo-clipboard', 'src/app/friend-my-code.tsx: expo-sharing']);
  const withPackageJson = parseDiff(`${diff}\ndiff --git a/package.json b/package.json\n+++ b/package.json\n+    "expo-clipboard": "~57.0.3",\n+    "expo-sharing": "~57.0.3",`);
  assert.deepEqual(missingImports(withPackageJson, ['@expo/ui']), []);
});
