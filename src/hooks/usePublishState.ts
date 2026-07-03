'use client';

import { useEffect } from 'react';
import { sharedStateStore } from '@/lib/shared-state-store';

/**
 * Publish a value to the shared-state bus from a native module component.
 *
 * Writes on every value change (the store coalesces identical re-publishes)
 * and holds a refcounted claim on the key: the value survives until the LAST
 * publisher of the key unmounts, so the dual-instance pattern (a background
 * provider plus a visible copy of the same module) is safe — rotation
 * unmounting the visible copy no longer wipes the background provider's
 * value. Pass `undefined` to skip publishing (e.g. while data is still
 * loading) without clearing an earlier value.
 *
 * Plugin code should use `window.__HS_SDK__.publishState` instead, which
 * enforces the plugin's key namespace.
 */
export function usePublishState(key: string, value: string | undefined): void {
  useEffect(() => {
    if (value !== undefined) sharedStateStore.publish(key, value);
  }, [key, value]);

  // claim() returns the release function — used directly as the effect cleanup.
  useEffect(() => sharedStateStore.claim(key), [key]);
}
