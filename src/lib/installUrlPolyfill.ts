import { URL as PolyfillURL, URLSearchParams as PolyfillURLSearchParams } from 'react-native-url-polyfill';

type UrlGlobal = typeof globalThis & {
  REACT_NATIVE_URL_POLYFILL?: string;
};

const polyfillVersion = 'react-native-url-polyfill@3.0.0';

function isWritableGlobal(key: 'URL' | 'URLSearchParams') {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  return !descriptor || descriptor.writable === true || typeof descriptor.set === 'function' || descriptor.configurable === true;
}

function installGlobalConstructor(key: 'URL' | 'URLSearchParams', value: unknown) {
  const currentValue = globalThis[key];
  if (typeof currentValue === 'function') return false;

  if (!isWritableGlobal(key)) {
    console.warn(`${key} is unavailable and cannot be polyfilled because the global property is read-only.`);
    return false;
  }

  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: false,
    writable: true,
    value,
  });
  return true;
}

const installedURL = installGlobalConstructor('URL', PolyfillURL);
const installedURLSearchParams = installGlobalConstructor('URLSearchParams', PolyfillURLSearchParams);

if (installedURL || installedURLSearchParams) {
  (globalThis as UrlGlobal).REACT_NATIVE_URL_POLYFILL = polyfillVersion;
}
