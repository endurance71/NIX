const { withXcodeProject } = require('expo/config-plugins');
const { applyNativeExtensions } = require('./native-extensions');

/**
 * Share extension, notification service extension and the iOS 18 Lock Screen camera extension
 * (see plugins/native-extensions). Idempotent: safe on an existing `ios/` and after prebuild.
 */
module.exports = function withNativeExtensions(config) {
  return withXcodeProject(config, (config) => {
    applyNativeExtensions(config.modResults, {
      projectRoot: config.modRequest.projectRoot,
      platformRoot: config.modRequest.platformProjectRoot,
    });
    return config;
  });
};
