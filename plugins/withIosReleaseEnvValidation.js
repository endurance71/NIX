const { withXcodeProject } = require('expo/config-plugins');

const PHASE_NAME = 'Bundle React Native code and images';
const MARKER = '# NiX release environment preflight';
const VALIDATION = `${MARKER}
if [[ "$CONFIGURATION" != *Debug* ]]; then
  "$NODE_BINARY" "$PROJECT_ROOT/scripts/validate-release-env.mjs" --mode production || exit 1
fi`;

function readShellScript(buildPhase) {
  const { shellScript } = buildPhase;
  if (!shellScript || typeof shellScript !== 'string') return null;
  if (shellScript.startsWith('"') && shellScript.endsWith('"')) {
    try {
      return JSON.parse(shellScript);
    } catch {
      return shellScript.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
  }
  return shellScript;
}

function ensureReleaseEnvValidation(script) {
  if (!script || script.includes(MARKER)) return script;
  const projectRootPattern = /export PROJECT_ROOT=(?:"\$PROJECT_DIR\/\.\."|"\$PROJECT_DIR"\/\.\.)/;
  const match = script.match(projectRootPattern);
  if (!match) {
    throw new Error('Could not add Release environment validation: PROJECT_ROOT anchor is missing');
  }
  return script.replace(match[0], `${match[0]}\n\n${VALIDATION}`);
}

function applyReleaseEnvValidationToProject(project) {
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    const phase = Object.values(phases).find((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      return String(candidate.name ?? '').replace(/^"|"$/g, '') === PHASE_NAME;
    });
    if (!phase) throw new Error(`Could not find Xcode phase: ${PHASE_NAME}`);
    const updated = ensureReleaseEnvValidation(readShellScript(phase));
    phase.shellScript = JSON.stringify(updated);
    return project;
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withIosReleaseEnvValidation = (config) =>
  withXcodeProject(config, (config) => {
    applyReleaseEnvValidationToProject(config.modResults);
    return config;
  });

module.exports = withIosReleaseEnvValidation;
module.exports.ensureReleaseEnvValidation = ensureReleaseEnvValidation;
module.exports.applyReleaseEnvValidationToProject = applyReleaseEnvValidationToProject;
module.exports.MARKER = MARKER;
