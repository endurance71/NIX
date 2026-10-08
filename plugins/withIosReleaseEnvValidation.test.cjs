const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ensureReleaseEnvValidation, MARKER } = require('./withIosReleaseEnvValidation');

test('release validation insertion is idempotent', () => {
  const initial = 'before\nexport PROJECT_ROOT="$PROJECT_DIR/.."\nafter\n';
  const once = ensureReleaseEnvValidation(initial);
  const twice = ensureReleaseEnvValidation(once);
  assert.equal(twice, once);
  assert.equal(once.split(MARKER).length - 1, 1);
});

test('fails if the expected bundle phase anchor changes', () => {
  assert.throws(() => ensureReleaseEnvValidation('unexpected script'), /PROJECT_ROOT/);
});

test('upgrades the existing preflight with a project root argument', () => {
  const previous = `${MARKER}\n"$NODE_BINARY" "$PROJECT_ROOT/scripts/validate-release-env.mjs" --mode production || exit 1`;
  const updated = ensureReleaseEnvValidation(previous);
  assert.match(updated, /--project-root "\$PROJECT_ROOT"/);
  assert.equal(ensureReleaseEnvValidation(updated), updated);
});
