import { useEffect, useLayoutEffect, useRef } from 'react';

/** setInterval that always calls the latest callback; `null` pauses it. Runs once immediately. */
export function useInterval(callback: () => void, delayMs: number | null, immediate = true): void {
  const saved = useRef(callback);
  useLayoutEffect(() => {
    saved.current = callback;
  });
  useEffect(() => {
    if (delayMs == null) return;
    if (immediate) saved.current();
    const id = setInterval(() => {
      if (!document.hidden) saved.current();
    }, delayMs);
    return () => clearInterval(id);
  }, [delayMs, immediate]);
}
