import { useState, useLayoutEffect, useCallback } from 'react';

const GROUP_STORAGE_PREFIX = 'hs-background-group-';

function readGroupOpen(id: string, defaultOpen: boolean): boolean {
  try {
    const stored = localStorage.getItem(GROUP_STORAGE_PREFIX + id);
    return stored === null ? defaultOpen : stored !== 'closed';
  } catch {
    return defaultOpen;
  }
}

function writeGroupOpen(id: string, open: boolean): void {
  try { localStorage.setItem(GROUP_STORAGE_PREFIX + id, open ? 'open' : 'closed'); } catch { /* private mode */ }
}

/**
 * Open/closed state of a collapsible background group, remembered per group
 * id in localStorage once the chevron has been used; until then `defaultOpen`
 * decides (a ticked source open, an unticked one closed).
 */
export function useGroupOpen(id: string, defaultOpen = true): [boolean, (open: boolean) => void] {
  // The server and the first client render must match, so the default
  // stands until the remembered state lands, before the first paint.
  const [open, setOpenState] = useState(defaultOpen);
  useLayoutEffect(() => { setOpenState(readGroupOpen(id, defaultOpen)); }, [id, defaultOpen]);
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    writeGroupOpen(id, next);
  }, [id]);
  return [open, setOpen];
}
