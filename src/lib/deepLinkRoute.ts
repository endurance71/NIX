export function isInboxDeepLink(url: string) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'nix:' && parsedUrl.hostname === 'inbox';
  } catch {
    return false;
  }
}
