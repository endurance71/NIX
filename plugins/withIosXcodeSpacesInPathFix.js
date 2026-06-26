const { withXcodeProject } = require('expo/config-plugins');

/**
 * Fixes Xcode shell scripts that resolve script paths via unquoted backticks.
 * Breaks when PROJECT_DIR contains spaces (e.g. /Volumes/Kingston XS1000 Media/...).
 *
 * Must emit shell content compatible with pbxproj quoting (all " escaped as \\" before write).
 */
function fixShellScriptPaths(script) {
  if (!script || typeof script !== 'string') {
    return script;
  }

  let fixed = script.replace(
    /export PROJECT_ROOT="\$PROJECT_DIR"\/\.\./g,
    'export PROJECT_ROOT="$PROJECT_DIR/.."',
  );

  // `node --print "…path…"` → "$( node --print "…path…" )"
  fixed = fixed.replace(/`([^`]*--print[^`]+)`/g, '"$($1)"');

  return fixed;
}

function readShellScript(buildPhase) {
  const { shellScript } = buildPhase;
  if (!shellScript) {
    return null;
  }

  if (typeof shellScript === 'string' && shellScript.startsWith('"') && shellScript.endsWith('"')) {
    try {
      return JSON.parse(shellScript);
    } catch {
      // One-line scripts (e.g. Sentry debug upload) are stored without JSON encoding.
      return shellScript.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
  }

  return shellScript;
}

function writeShellScript(buildPhase, script) {
  buildPhase.shellScript = JSON.stringify(script);
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withIosXcodeSpacesInPathFix = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};

    for (const phase of Object.values(phases)) {
      if (!phase || typeof phase !== 'object' || !phase.shellScript) {
        continue;
      }

      const current = readShellScript(phase);
      const fixed = fixShellScriptPaths(current);
      if (fixed && fixed !== current) {
        writeShellScript(phase, fixed);
      }
    }

    return config;
  });

module.exports = withIosXcodeSpacesInPathFix;
