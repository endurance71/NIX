import { readFile } from 'node:fs/promises';

const source = await readFile('src/services/textOutboxService.ts', 'utf8');
const keys = await readFile('src/lib/accountEncryptionKeys.ts', 'utf8');
const implementation = source + keys;
const failures = [];

const requiredMarkers = [
  ['AES-256 key generation', 'crypto.generate(AESKeySize.AES256)'],
  ['AES-GCM encryption', 'aesEncryptAsync(plaintext, key)'],
  ['AES-GCM decryption', 'aesDecryptAsync(sealed, key)'],
  ['Keychain storage', 'storage.setItemAsync(name, value, OPTIONS)'],
  ['Keychain deletion', 'storage.deleteItemAsync(name, OPTIONS)'],
  ['Encrypted SQLite payload', 'encrypted_payload TEXT NOT NULL'],
  ['Per-owner queue deletion', "DELETE FROM text_outbox WHERE owner_id = ?"],
  ['24-hour expiry', 'const OUTBOX_TTL_MS = 24 * 60 * 60 * 1000'],
];

for (const [label, marker] of requiredMarkers) {
  if (!implementation.includes(marker)) failures.push(`${label} invariant is missing`);
}

const schemaMatch = source.match(/CREATE TABLE IF NOT EXISTS text_outbox \(([\s\S]*?)\);/);
if (!schemaMatch) {
  failures.push('text_outbox schema was not found');
} else {
  const schema = schemaMatch[1];
  if (/\bbody\b|\breceiver_id\b/.test(schema)) {
    failures.push('plaintext receiver or message body must not be stored in SQLite');
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Text outbox security invariants passed.');
