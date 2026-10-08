import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalTypeDatabase } from './lib/local-type-database.mjs';

test('accepts an explicit isolated local target', () => {
  assert.deepEqual(parseLocalTypeDatabase('postgres://postgres@127.0.0.1:15439/nix_backend_validation'),
    { host: '127.0.0.1', port: '15439', user: 'postgres', password: '', database: 'nix_backend_validation' });
  assert.equal(parseLocalTypeDatabase('postgresql://postgres@[::1]:54322/postgres').host, '::1');
});

for (const address of [
  'postgres://postgres@db.example.com:54322/postgres',
  'postgres://postgres@127.0.0.1:5432/postgres',
  'postgres://postgres@127.0.0.1:54322/postgres?host=remote',
  'postgres://postgres@127.0.0.1:54322/postgres#remote',
  'postgres://postgres@127.0.0.1:54322/host%3Dremote%20dbname%3Dprod',
  'postgres://postgres@127.0.0.1:54322/postgresql%3A%2F%2Fremote%2Fprod',
  'postgres://postgres@127.0.0.1:54322/-c',
]) {
  test(`rejects unsafe type-generation target: ${address}`, () => {
    assert.throws(() => parseLocalTypeDatabase(address), /explicit local target/);
  });
}
