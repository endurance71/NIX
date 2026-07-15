import { readFileSync } from 'node:fs';
import { assertSentryDisabled } from './check-sentry-disabled.mjs';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const plist = readFileSync(new URL('../ios/NiX/Info.plist', import.meta.url), 'utf8');
const en = readFileSync(new URL('../ios/NiX/Supporting/en.lproj/InfoPlist.strings', import.meta.url), 'utf8');
const pl = readFileSync(new URL('../ios/NiX/Supporting/pl.lproj/InfoPlist.strings', import.meta.url), 'utf8');
const entitlements = readFileSync(new URL('../ios/NiX/NiX.entitlements', import.meta.url), 'utf8');

const purposeKeys = ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription'];
let failed = false;

function fail(message) {
  failed = true;
  console.error(`iOS config: ${message}`);
}

for (const key of purposeKeys) {
  const expected = app.ios.infoPlist[key];
  const plistEntry = `<key>${key}</key>\n\t<string>${expected}</string>`;
  if (!plist.includes(plistEntry)) fail(`${key} differs between app.json and native Info.plist`);
  if (!en.includes(`"${key}" = "${expected}";`)) fail(`${key} is missing or stale in English localization`);
  if (!pl.includes(`"${key}" = `)) fail(`${key} is missing in Polish localization`);
}

for (const forbiddenKey of ['UIBackgroundModes', 'NSFaceIDUsageDescription', 'NSLocalNetworkUsageDescription', 'NSBonjourServices']) {
  if (plist.includes(`<key>${forbiddenKey}</key>`)) fail(`${forbiddenKey} must not be present in the production plist`);
}

if (app.ios.infoPlist.UIBackgroundModes) fail('UIBackgroundModes must not be declared in app.json');
if (!app.plugins?.includes('expo-notifications')) fail('expo-notifications plugin is missing in app.json');
if (!entitlements.includes('<key>aps-environment</key>')) fail('aps-environment is missing from NiX.entitlements');
if (!assertSentryDisabled()) failed = true;
if (failed) process.exit(1);
console.log('iOS app.json, Info.plist and PL/EN purpose strings are synchronized.');
