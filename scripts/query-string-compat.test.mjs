import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const queryString = require('query-string');

test('Expo Router query parser supports the patched ESM decoder', () => {
  assert.equal(queryString.parse('invite=Za%C5%BC%C3%B3%C5%82%C4%87').invite, 'Zażółć');
  assert.equal(queryString.parse('invite=%F0%9F%92%A9').invite, '💩');
  assert.equal(queryString.parse('invite=%E0%A4%A').invite, '%E0%A4%A');
  assert.equal(queryString.parse('invite=%').invite, '%');
});

test('large malformed percent input completes without recursive decoder overflow', () => {
  const value = '%FF'.repeat(100_000);
  assert.equal(queryString.parse(`invite=${value}`).invite, value);
});
