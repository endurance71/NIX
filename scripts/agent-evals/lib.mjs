// Pure helpers for the agent eval harness: trace parsing, diff parsing and
// the three measurement layers from the Expo "skills need an evaluation
// mechanism" approach — triggering (did guidance enter context), uptake (is it
// visible in commands/code) and outcome (did the run meet the scenario).

export function packageDependencies(packageJson) {
  return Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.peerDependencies });
}

export function parseTrace(text) {
  const calls = [];
  let result = null;
  let catalog = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'system' && event.subtype === 'init') {
      // What the agent could discover: crowded catalogs change triggering.
      catalog = {
        skills: (event.skills ?? []).map(skillName),
        plugins: (event.plugins ?? []).map((plugin) => (typeof plugin === 'string' ? plugin : plugin.name)),
      };
    } else if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) {
        if (block?.type === 'tool_use') calls.push({ name: block.name, input: block.input ?? {} });
      }
    } else if (event.type === 'result') {
      result = {
        costUsd: event.total_cost_usd ?? null,
        numTurns: event.num_turns ?? null,
        durationMs: event.duration_ms ?? null,
        isError: Boolean(event.is_error),
        text: typeof event.result === 'string' ? event.result : '',
      };
    }
  }
  return { calls, result, catalog };
}

// `plugin:skill` and `skill` refer to the same skill for recall purposes.
export function skillName(raw) {
  return String(raw ?? '').split(':').pop();
}

function callText(call) {
  const { input } = call;
  return [input.command, input.file_path, input.path, input.pattern, input.notebook_path]
    .filter((value) => typeof value === 'string')
    .join('\n');
}

export function extractEvidence(calls, expectedDocs = []) {
  const skills = [];
  const commands = [];
  const docsRead = new Set();
  let firstGuidanceIndex = null;

  calls.forEach((call, index) => {
    let isGuidance = false;
    if (call.name === 'Skill') {
      skills.push(skillName(call.input.skill));
      isGuidance = true;
    }
    if (call.name === 'Bash' && typeof call.input.command === 'string') commands.push(call.input.command);
    const text = callText(call);
    for (const doc of expectedDocs) {
      if (text.includes(doc)) {
        docsRead.add(doc);
        isGuidance = true;
      }
    }
    if (isGuidance && firstGuidanceIndex === null) firstGuidanceIndex = index;
  });

  return {
    skills: [...new Set(skills)],
    commands,
    docsRead: [...docsRead],
    // Relative position of the first guidance load (0 = very first tool call).
    // The Expo traces showed loading clusters early and tapers off.
    firstGuidancePosition: firstGuidanceIndex === null || calls.length === 0 ? null : firstGuidanceIndex / calls.length,
  };
}

export function parseDiff(diffText) {
  const files = [];
  let current = null;
  for (const line of diffText.split('\n')) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      current = { path: header[2], status: 'modified', addedLines: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('new file mode')) current.status = 'added';
    else if (line.startsWith('deleted file mode')) current.status = 'deleted';
    else if (line.startsWith('+') && !line.startsWith('+++')) current.addedLines.push(line.slice(1));
  }
  return files;
}

export function resolveRules(scenario, ruleSets = {}) {
  const forbiddenCommands = [];
  const forbiddenCode = [];
  for (const name of scenario.rules ?? []) {
    const set = ruleSets[name];
    if (!set) throw new Error(`Scenario ${scenario.id}: unknown rule set "${name}"`);
    forbiddenCommands.push(...(set.forbiddenCommands ?? []));
    forbiddenCode.push(...(set.forbiddenCode ?? []));
  }
  return { forbiddenCommands, forbiddenCode };
}

function recall(expected, found) {
  if (!expected.length) return null;
  const hits = expected.filter((item) => found.includes(item)).length;
  return hits / expected.length;
}

const BARE_IMPORT = /(?:from\s+|import\s*\(\s*|require\(\s*|^\s*import\s+)['"]([^'"./][^'"]*)['"]/g;

function packageRoot(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

// Static build-health check: new app code must not import a package that is
// neither installed nor added to package.json in the same diff.
export function missingImports(files, dependencies) {
  const known = new Set(dependencies);
  for (const line of files.find((file) => file.path === 'package.json')?.addedLines ?? []) {
    const match = /^\s*"((?:@[^/"]+\/)?[^"]+)":\s*"/.exec(line);
    if (match) known.add(match[1]);
  }
  const missing = [];
  for (const file of files) {
    if (!/^src\/.*\.[cm]?[jt]sx?$/.test(file.path)) continue;
    for (const line of file.addedLines) {
      for (const [, specifier] of line.matchAll(BARE_IMPORT)) {
        const root = packageRoot(specifier);
        if (root === '@' || specifier.startsWith('@/') || specifier.startsWith('node:') || known.has(root)) continue;
        missing.push(`${file.path}: ${root}`);
      }
    }
  }
  return [...new Set(missing)];
}

export function evaluateRun({ scenario, ruleSets, trace, diff, dependencies = null }) {
  const expectedDocs = scenario.expectedDocs ?? [];
  const expectedSkills = scenario.expectedSkills ?? [];
  const evidence = extractEvidence(trace.calls, expectedDocs);
  const files = parseDiff(diff ?? '');
  const { forbiddenCommands, forbiddenCode } = resolveRules(scenario, ruleSets);
  const violations = [];
  const unmet = [];

  for (const rule of forbiddenCommands) {
    const re = new RegExp(rule.pattern);
    for (const command of evidence.commands) {
      if (re.test(command)) violations.push({ layer: 'process', why: rule.why, detail: command.slice(0, 200) });
    }
  }

  for (const rule of forbiddenCode) {
    const re = new RegExp(rule.pattern);
    const pathRe = rule.paths ? new RegExp(rule.paths) : null;
    for (const file of files) {
      if (pathRe && !pathRe.test(file.path)) continue;
      const line = file.addedLines.find((added) => re.test(added));
      if (line !== undefined) violations.push({ layer: 'uptake', why: rule.why, detail: `${file.path}: ${line.trim().slice(0, 160)}` });
    }
  }

  if (dependencies) {
    for (const detail of missingImports(files, dependencies)) {
      violations.push({ layer: 'uptake', why: 'Import pakietu, którego nie ma w package.json (build się nie powiedzie)', detail });
    }
  }

  for (const rule of scenario.protectedPaths ?? []) {
    const re = new RegExp(rule.pattern);
    for (const file of files) {
      if (file.status !== 'added' && re.test(file.path)) violations.push({ layer: 'uptake', why: rule.why, detail: `${file.status}: ${file.path}` });
    }
  }

  for (const pattern of scenario.requiredChangedFiles ?? []) {
    const re = new RegExp(pattern);
    if (!files.some((file) => re.test(file.path))) unmet.push(`no changed file matches ${pattern}`);
  }

  for (const pattern of scenario.expectedCommands ?? []) {
    const re = new RegExp(pattern);
    if (!evidence.commands.some((command) => re.test(command))) unmet.push(`no command matches ${pattern}`);
  }

  for (const pattern of scenario.expectedAnswer ?? []) {
    if (!new RegExp(pattern, 'i').test(trace.result?.text ?? '')) unmet.push(`final answer does not match ${pattern}`);
  }

  if (scenario.noChanges && files.length) unmet.push(`expected no changes, got ${files.length} changed file(s)`);

  return {
    scenario: scenario.id,
    triggered: evidence.skills.length > 0,
    skillsLoaded: evidence.skills,
    skillRecall: recall(expectedSkills, evidence.skills),
    docRecall: recall(expectedDocs, evidence.docsRead),
    docsRead: evidence.docsRead,
    firstGuidancePosition: evidence.firstGuidancePosition,
    toolCalls: trace.calls.length,
    catalogSize: trace.catalog?.skills.length ?? null,
    // Expected skills the agent could not have loaded because they were not in its catalog.
    unavailableSkills: trace.catalog ? expectedSkills.filter((skill) => !trace.catalog.skills.includes(skill)) : [],
    changedFiles: files.map((file) => file.path),
    violations,
    unmet,
    // Missing a skill is reported via recall, never failed on its own: an agent
    // that solves the task without it may mean the base model absorbed it.
    pass: violations.length === 0 && unmet.length === 0,
    costUsd: trace.result?.costUsd ?? null,
  };
}

function mean(values) {
  const present = values.filter((value) => typeof value === 'number');
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

export function summarize(runs) {
  return {
    runs: runs.length,
    passRate: mean(runs.map((run) => (run.pass ? 1 : 0))),
    triggerRate: mean(runs.map((run) => (run.triggered ? 1 : 0))),
    skillRecall: mean(runs.map((run) => run.skillRecall)),
    docRecall: mean(runs.map((run) => run.docRecall)),
    firstGuidancePosition: mean(runs.map((run) => run.firstGuidancePosition)),
    processViolations: runs.reduce((sum, run) => sum + run.violations.filter((v) => v.layer === 'process').length, 0),
    uptakeViolations: runs.reduce((sum, run) => sum + run.violations.filter((v) => v.layer === 'uptake').length, 0),
    costUsd: runs.reduce((sum, run) => sum + (run.costUsd ?? 0), 0),
  };
}
