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
