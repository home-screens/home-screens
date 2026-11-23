'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { displayFetch } from '@/lib/display-fetch';
import type { DisplaysApiResponse } from '@/lib/displays-api-types';
import { CONFIRM_TIMEOUT_MS, agreedBrightness, type BrightnessReport } from '@/lib/display-liveness';

/** Key for the single-display install, which reports status without an id. */
export const LEGACY_KEY = '__default__';
const POLL_MS = 5000;

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

/** What every display last reported, by key. */
export type ReportedBrightness = Record<string, BrightnessReport>;

/**
 * The value the target's displays agree on, by the rule the phone's
 * brightness card uses (`agreedBrightness`): a display that has stopped
 * answering is left out, so "Every wall" with one wall unplugged still
 * shows the level of the others.
 *
 * "Now" is the newest heartbeat in the report, not this device's clock. The
 * heartbeat times are stamped by the hub, a wall's own heartbeat is never
 * more than a few seconds old, and a kiosk whose clock is wrong would
 * otherwise call every display silent.
 */
export function agreedValue(keys: string[], reported: ReportedBrightness): number | null {
  const hubNow = Math.max(0, ...Object.values(reported).map((report) => report.lastSeen ?? 0));
  return agreedBrightness(keys.flatMap((key) => (reported[key] ? [reported[key]] : [])), hubNow);
}

async function fetchReported(legacy: boolean): Promise<ReportedBrightness> {
  if (legacy) {
    const res = await displayFetch('/api/display/status');
    if (!res.ok) return {};
    // null until the display has sent its first heartbeat.
    const status = (await res.json()) as { brightness?: unknown; lastSeen?: unknown } | null;
    if (typeof status?.brightness !== 'number') return {};
    return { [LEGACY_KEY]: { brightness: status.brightness, lastSeen: typeof status.lastSeen === 'number' ? status.lastSeen : null } };
  }
  const res = await displayFetch('/api/displays');
  if (!res.ok) return {};
  const body = (await res.json()) as DisplaysApiResponse;
  const out: ReportedBrightness = {};
  for (const d of body.displays ?? []) {
    out[d.id] = { brightness: d.status?.brightness, lastSeen: d.lastSeen };
  }
  return out;
}

/**
 * Brightness of whatever the module currently controls, read from the hub's
 * heartbeat store by the same rule as the family remote's brightness card.
 * `value` is the last value sent until the target confirms it, else the
 * reported value, else null (nothing reported yet, or "Every wall"
 * disagreeing).
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
  const [reported, setReported] = useState<ReportedBrightness>({});
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

  // Settle the sent value once every answering target reports it.
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
    }, CONFIRM_TIMEOUT_MS);
  }, []);

  return { value: pending ?? agreed, markSent };
}
