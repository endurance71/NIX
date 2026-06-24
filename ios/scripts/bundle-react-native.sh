#!/bin/bash
# Wrapper for Expo/RN bundle phase. Keeps paths with spaces safe (e.g. external volumes).
set -euo pipefail

if [[ -f "$PODS_ROOT/../.xcode.env" ]]; then
  # shellcheck source=/dev/null
  source "$PODS_ROOT/../.xcode.env"
fi
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  # shellcheck source=/dev/null
  source "$PODS_ROOT/../.xcode.env.local"
fi

# The project root by default is one level up from the ios directory.
export PROJECT_ROOT="$PROJECT_DIR/.."

if [[ "$CONFIGURATION" = *Debug* ]]; then
  export SKIP_BUNDLING=1
fi

if [[ -z "${ENTRY_FILE:-}" ]]; then
  export ENTRY_FILE="$("$NODE_BINARY" -e "require('expo/scripts/resolveAppEntry')" "$PROJECT_ROOT" ios absolute | tail -n 1)"
fi

if [[ -z "${CLI_PATH:-}" ]]; then
  export CLI_PATH="$("$NODE_BINARY" --print "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })")"
fi

if [[ -z "${BUNDLE_COMMAND:-}" ]]; then
  export BUNDLE_COMMAND="export:embed"
fi

if [[ -f "$PODS_ROOT/../.xcode.env.updates" ]]; then
  # shellcheck source=/dev/null
  source "$PODS_ROOT/../.xcode.env.updates"
fi
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  # shellcheck source=/dev/null
  source "$PODS_ROOT/../.xcode.env.local"
fi

RN_XCODE_SCRIPT="$("$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'")"
exec /bin/bash "$RN_XCODE_SCRIPT"
