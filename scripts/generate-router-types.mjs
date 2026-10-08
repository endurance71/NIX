import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
const { requireContext } = require('expo-router/internal/testing');
const { EXPO_ROUTER_CTX_IGNORE } = require('expo-router/_ctx-shared');
const { getTypedRoutesDeclarationFile } = cliRequire('@expo/router-server/build/typed-routes/generate');
const context = requireContext(path.join(root, 'src/app'), true, EXPO_ROUTER_CTX_IGNORE);
const declaration = getTypedRoutesDeclarationFile(context);
if (!declaration) throw new Error('Expo Router did not generate route declarations');
const output = path.join(root, '.expo/types');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'router.d.ts'), declaration);
console.log('Expo Router types regenerated from src/app.');
