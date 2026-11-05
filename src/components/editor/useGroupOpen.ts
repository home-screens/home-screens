import { useState, useLayoutEffect, useCallback } from 'react';

const GROUP_STORAGE_PREFIX = 'hs-background-group-';

function readGroupOpen(id: string): boolean {
  try {
    return localStorage.getItem(GROUP_STORAGE_PREFIX + id) !== 'closed';
  } catch {
    return true;
  }
}

function writeGroupOpen(id: string, open: boolean): void {
  try { localStorage.setItem(GROUP_STORAGE_PREFIX + id, open ? 'open' : 'closed'); } catch { /* private mode */ }
}

/** Open/closed state of a collapsible background group, remembered per group id in localStorage (open by default). */
export function useGroupOpen(id: string): [boolean, (open: boolean) => void] {
  // Open on the server and on the first client render (the two must match),
  // then the remembered state lands before the first paint, so a closed
  // group never flashes open.
  const [open, setOpenState] = useState(true);
  useLayoutEffect(() => { setOpenState(readGroupOpen(id)); }, [id]);
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    writeGroupOpen(id, next);
  }, [id]);
  return [open, setOpen];
}
