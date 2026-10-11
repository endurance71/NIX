const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

function assertSingleReactNativeRuntime() {
  const denoModulesDir = path.join(__dirname, "node_modules", ".deno");
  if (fs.existsSync(denoModulesDir)) {
    throw new Error(
      "[NiX] Mixed Deno/npm node_modules detected. Keep deno.json nodeModulesDir set to none, then recreate dependencies with npm ci."
    );
  }

  const rootReactNative = fs.realpathSync(
    path.dirname(require.resolve("react-native/package.json", { paths: [__dirname] }))
  );
  const expoPackage = require.resolve("expo/package.json", { paths: [__dirname] });
  const expoReactNative = fs.realpathSync(
    path.dirname(require.resolve("react-native/package.json", { paths: [expoPackage] }))
  );

  if (rootReactNative !== expoReactNative) {
    throw new Error(
      `[NiX] Multiple React Native runtimes detected: ${rootReactNative} and ${expoReactNative}. Recreate dependencies with npm ci.`
    );
  }
}

assertSingleReactNativeRuntime();

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// react-native-qrcode-svg only needs `QRCode.create` from `qrcode`. Resolving the
// package normally loads `lib/browser.js`, which pulls `./can-promise` — Metro 0.83
// fails that resolution / SHA-1 pipeline for this file. Pointing at the core module
// avoids the browser bundle entirely.
//
// PERF-5: while remote monitoring is off (the default; see docs/observability.md), ship a no-op
// `@sentry/react-native` instead of the ~840 KB SDK. Builds made with
// EXPO_PUBLIC_SENTRY_ENABLED=true resolve the real package. The QR code never renders an SVG
// logo, so `react-native-svg/css` (css-tree + entities) is stubbed for that importer only.
const SENTRY_BUNDLED = process.env.EXPO_PUBLIC_SENTRY_ENABLED === "true";
const SENTRY_STUB = path.resolve(__dirname, "metro-shims/sentry-react-native.js");
const SVG_CSS_STUB = path.resolve(__dirname, "metro-shims/react-native-svg-css.js");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath?.replace(/\\/g, "/") ?? "";
  if (moduleName === "qrcode" && origin.includes("react-native-qrcode-svg")) {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "node_modules/qrcode/lib/core/qrcode.js"),
    };
  }
  if (moduleName === "@sentry/react-native" && !SENTRY_BUNDLED) {
    return { type: "sourceFile", filePath: SENTRY_STUB };
  }
  if (moduleName === "react-native-svg/css" && origin.includes("react-native-qrcode-svg/src/LogoSVG")) {
    return { type: "sourceFile", filePath: SVG_CSS_STUB };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// PERF-4: inline requires stay OFF (Expo's default is { experimentalImportSupport: true,
// inlineRequires: false }). Turning them on defers every module imported only for a symbol until
// first use, which moves module-scope side effects out of startup: TaskManager.defineTask in
// UploadQueueProvider (a cold background launch would then hit an undefined task, and
// expo-task-manager unregisters it), Notifications.setNotificationHandler, the i18n init and
// the URL polyfill. Opt-in only for local profiling; never set it for a release or OTA bundle.
if (process.env.NIX_METRO_INLINE_REQUIRES === "1") {
  config.transformer.getTransformOptions = async () => ({
    transform: { experimentalImportSupport: true, inlineRequires: true },
  });
}

module.exports = config;
