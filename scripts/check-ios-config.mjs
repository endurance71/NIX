import { readFileSync } from 'node:fs';
import { assertSentryDisabled } from './check-sentry-disabled.mjs';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const plist = readFileSync(new URL('../ios/NiX/Info.plist', import.meta.url), 'utf8');
const en = readFileSync(new URL('../ios/NiX/Supporting/en.lproj/InfoPlist.strings', import.meta.url), 'utf8');
const pl = readFileSync(new URL('../ios/NiX/Supporting/pl.lproj/InfoPlist.strings', import.meta.url), 'utf8');
const entitlements = readFileSync(new URL('../ios/NiX/NiX.entitlements', import.meta.url), 'utf8');
const project = readFileSync(new URL('../ios/NiX.xcodeproj/project.pbxproj', import.meta.url), 'utf8');

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

if (!plist.includes(`<key>CFBundleDisplayName</key>\n\t<string>${app.name}</string>`)) {
  fail('CFBundleDisplayName differs from app.json name');
}
if (!plist.includes(`<key>CFBundleShortVersionString</key>\n\t<string>${app.version}</string>`)) {
  fail('CFBundleShortVersionString differs from app.json version');
}
if (!plist.includes('<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>')) {
  fail('ITSAppUsesNonExemptEncryption must be false');
}
if (!project.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${app.ios.bundleIdentifier};`)) {
  fail('native PRODUCT_BUNDLE_IDENTIFIER differs from app.json');
}
if (!project.includes('TARGETED_DEVICE_FAMILY = 1;')) {
  fail('native target must remain iPhone-only while supportsTablet is false');
}
if (app.ios.infoPlist.UIBackgroundModes) fail('UIBackgroundModes must not be declared in app.json');
if (!app.plugins?.includes('expo-notifications')) fail('expo-notifications plugin is missing in app.json');
if (!entitlements.includes('<key>aps-environment</key>')) fail('aps-environment is missing from NiX.entitlements');
if (app.ios.usesAppleSignIn && !entitlements.includes('<key>com.apple.developer.applesignin</key>')) {
  fail('Sign in with Apple entitlement is missing from NiX.entitlements');
}
if (!assertSentryDisabled()) failed = true;
if (failed) process.exit(1);
console.log('iOS app.json, Info.plist and PL/EN purpose strings are synchronized.');
