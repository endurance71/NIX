import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'pl' }] }));

const SOURCE_ROOT = path.resolve(__dirname, '..');
// Literal keys only: `t('a.b')`, `i18n.t("a.b", …)`. Template literals are skipped on purpose.
const KEY_CALL = /\bt\(\s*(['"])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\1/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return sourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [fullPath] : [];
  });
}

function hasKey(tree: unknown, key: string): boolean {
  const segments = key.split('.');
  const last = segments.pop()!;
  let node = tree as Record<string, unknown> | undefined;
  for (const segment of segments) {
    node = node?.[segment] as Record<string, unknown> | undefined;
    if (!node || typeof node !== 'object') return false;
  }
  if (!node) return false;
  if (typeof node[last] === 'string') return true;
  // Plural forms: `key_one`, `key_other`, …
  return Object.keys(node).some((candidate) => candidate.startsWith(`${last}_`));
}

describe('i18n key coverage', () => {
  it('every literal t() key used in src exists in both PL and EN', async () => {
    const { resources } = await import('./i18n');
    const missing: string[] = [];
    for (const file of sourceFiles(SOURCE_ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(KEY_CALL)) {
        const key = match[2];
        for (const locale of ['pl', 'en'] as const) {
          if (!hasKey(resources[locale].translation, key)) {
            missing.push(`${locale}:${key} (${path.relative(SOURCE_ROOT, file)})`);
          }
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
