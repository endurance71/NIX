/**
 * iOS gives an app a new data container (`…/Containers/Data/Application/<UUID>/`) on every
 * install or update and moves the files over, so an absolute `file://` URI stored before an
 * update points at a directory that no longer exists. The upload queue keeps the staged and
 * prepared files as absolute URIs; they are rebased onto the current container when read.
 */
const CONTAINER_SEGMENT = /\/Containers\/Data\/Application\/[0-9A-Fa-f-]+\//;

/** The `…/Containers/Data/Application/<UUID>/` prefix of a container-scoped URI, or null. */
export function containerRootOf(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const match = CONTAINER_SEGMENT.exec(uri);
  if (!match) return null;
  return uri.slice(0, match.index + match[0].length);
}

/**
 * `uri` with its data-container prefix replaced by the one `currentContainerUri` lives in
 * (`FileSystem.documentDirectory` today). Leaves the URI alone when either side is not a
 * container path, or when it already points at the current container. `/private/var` and
 * `/var` spellings of the same container are treated as equal.
 */
export function rebaseContainerUri(uri: string, currentContainerUri: string | null | undefined): string {
  const current = containerRootOf(currentContainerUri);
  const stored = containerRootOf(uri);
  if (!current || !stored) return uri;
  if (stripPrivatePrefix(stored) === stripPrivatePrefix(current)) return uri;
  return current + uri.slice(stored.length);
}

function stripPrivatePrefix(root: string) {
  return root.replace('file:///private/var/', 'file:///var/');
}
