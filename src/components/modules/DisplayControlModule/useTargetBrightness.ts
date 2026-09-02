'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { displayFetch } from '@/lib/display-fetch';
import type { DisplaysApiResponse } from '@/lib/displays-api-types';

/** Key for the single-display install, which reports status without an id. */
export const LEGACY_KEY = '__default__';
const POLL_MS = 5000;
/** How long a sent value is shown while the target has not confirmed it yet. */
const PENDING_TIMEOUT_MS = 10_000;

/** Which heartbeat reports the current target's brightness comes from. */
export function targetKeys(
  target: string | undefined,
  selfId: string | undefined,
  availableDisplays: Array<{ id: string }>,
): string[] {
  if (availableDisplays.length === 0) return [LEGACY_KEY];
  if (target === 'all') return availableDisplays.map((d) => d.id);
  if (target) return [target];
  return selfId ? [selfId] : [];
}

/** One value every key reports, or null when any is missing or they disagree. */
export function agreedValue(keys: string[], reported: Record<string, number>): number | null {
  if (keys.length === 0) return null;
  const first = reported[keys[0]];
  if (typeof first !== 'number') return null;
  return keys.every((k) => reported[k] === first) ? first : null;
}

async function fetchReported(legacy: boolean): Promise<Record<string, number>> {
  if (legacy) {
    const res = await displayFetch('/api/display/status');
    if (!res.ok) return {};
    const status = (await res.json()) as { brightness?: unknown };
    return typeof status.brightness === 'number' ? { [LEGACY_KEY]: status.brightness } : {};
  }
  const res = await displayFetch('/api/displays');
  if (!res.ok) return {};
  const body = (await res.json()) as DisplaysApiResponse;
  const out: Record<string, number> = {};
  for (const d of body.displays ?? []) {
    if (typeof d.status?.brightness === 'number') out[d.id] = d.status.brightness;
  }
  return out;
}

/**
 * Brightness of whatever the module currently controls, read from the hub's
 * heartbeat store (the same report the family remote's brightness card
 * seeds from). `value` is the last value sent until the target confirms it,
 * else the reported value, else null (nothing reported yet, or "All
 * displays" disagreeing).
 *
 * `live` keeps polling every 5s (the kiosk); otherwise the report is read
 * once so an editor preview shows real numbers without a poll loop.
 */
export function useTargetBrightness({
  target,
  selfId,
  availableDisplays,
  live,
}: {
  target: string | undefined;
  selfId: string | undefined;
  availableDisplays: Array<{ id: string; name: string }>;
  live: boolean;
}): { value: number | null; markSent: (v: number) => void } {
  const [reported, setReported] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const legacy = availableDisplays.length === 0;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchReported(legacy)
        .then((next) => {
          if (!cancelled) setReported(next);
        })
        .catch(() => {});
    };
    load();
    if (!live) return () => { cancelled = true; };
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [legacy, live]);

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  const keys = targetKeys(target, selfId, availableDisplays);
  const agreed = agreedValue(keys, reported);

  // Settle the sent value once every target reports it.
  useEffect(() => {
    if (pending !== null && agreed === pending) {
      setPending(null);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    }
  }, [agreed, pending]);

  const markSent = useCallback((v: number) => {
    setPending(v);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      pendingTimer.current = null;
      setPending(null);
    }, PENDING_TIMEOUT_MS);
  }, []);

  return { value: pending ?? agreed, markSent };
}
