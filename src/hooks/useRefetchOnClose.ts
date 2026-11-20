'use client';

import { useEffect, useRef } from 'react';

/**
 * Read a list again once the window that edits it closes. An editor panel
 * that opens a window (chores, lists, timetables) shows counts or names from
 * data the window writes straight to the hub, so the panel's own copy is old
 * the moment the window closes. The panel's hook already loads on mount, so
 * the first run is skipped and mount stays at one request.
 */
export function useRefetchOnClose(open: boolean, refetch: () => void): void {
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    if (!open) refetch();
  }, [open, refetch]);
}
