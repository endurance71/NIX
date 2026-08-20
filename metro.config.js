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
