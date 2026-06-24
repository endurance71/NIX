export async function runWithFinally<T>(run: () => Promise<T>, cleanup: () => void): Promise<T> {
  try {
    return await run();
  } finally {
    cleanup();
  }
}
