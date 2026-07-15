const path = require("path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// react-native-qrcode-svg only needs `QRCode.create` from `qrcode`. Resolving the
// package normally loads `lib/browser.js`, which pulls `./can-promise` — Metro 0.83
// fails that resolution / SHA-1 pipeline for this file. Pointing at the core module
// avoids the browser bundle entirely.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "qrcode") {
    const origin = context.originModulePath?.replace(/\\/g, "/") ?? "";
    if (origin.includes("react-native-qrcode-svg")) {
      return {
        type: "sourceFile",
        filePath: path.resolve(__dirname, "node_modules/qrcode/lib/core/qrcode.js"),
      };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
