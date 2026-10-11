// Bundled instead of `@sentry/react-native` (~840 KB) when EXPO_PUBLIC_SENTRY_ENABLED !== 'true'
// (see metro.config.js, PERF-5). Keep in sync with the Sentry API used by src/lib/monitoring.ts;
// every function is a no-op because the runtime gate there never calls Sentry in this mode.
const noop = () => undefined;

export const init = noop;
export const addBreadcrumb = noop;
export const captureMessage = noop;
export const captureException = noop;
export const setUser = noop;
export const setTag = noop;
export const wrap = (component) => component;
