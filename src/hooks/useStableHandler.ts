import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a callback whose identity never changes but which always runs the latest `handler`.
 * Lets memoized list cells and the composer receive handlers without depending on the whole view
 * model (PERF-10). Do not call the result during render.
 */
export function useStableHandler<Args extends unknown[], Result>(
  handler: (...args: Args) => Result
): (...args: Args) => Result {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  return useCallback((...args: Args) => handlerRef.current(...args), []);
}
