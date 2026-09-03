'use client';

import { useEffect, useState } from 'react';
import { displayFetch } from '@/lib/display-fetch';
import type { HubAddressResponse } from '@/app/api/system/address/route';

/**
 * The origin to print for this hub, or `''` until it is known.
 *
 * Usually the browser's own `window.location.origin`: whatever address the
 * user typed to get here (a hostname, a `.local` name, a LAN IP) is one a
 * phone next to them can reach too. The exception is a kiosk running on the
 * hub Pi itself, which opens `http://localhost:3000/display`; "localhost"
 * printed on a wall is no use to anyone, so a loopback origin is swapped for
 * the hub's LAN address from `/api/system/address`. That lookup happens once
 * per page and is shared by every caller; if it fails, the loopback origin is
 * still better than nothing.
 *
 * Deliberately not `typeof window !== 'undefined' ? window.location.origin : ''`
 * read during render: `/editor` is statically rendered, so that expression
 * evaluates to `''` at build time and to a real origin on the client, and React
 * flags the mismatch when it hydrates. Setting it in an effect makes the first
 * client render match the server's and the address appear a tick later.
 *
 * Callers must render something sensible for `''` — `phoneSurfaceUrl` falls
 * back to the bare path, which is still a working same-origin link.
 */
export function useOrigin(): string {
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    let cancelled = false;
    resolveOrigin().then((o) => { if (!cancelled) setOrigin(o); });
    return () => { cancelled = true; };
  }, []);
  return origin;
}

/** `localhost`, `*.localhost`, `127.x`, `[::1]`, `0.0.0.0`: the hub's own machine. */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h.startsWith('127.') || h === '[::1]' || h === '0.0.0.0';
}

let pending: Promise<string> | null = null;

function resolveOrigin(): Promise<string> {
  const own = window.location.origin;
  if (!isLoopbackHost(window.location.hostname)) return Promise.resolve(own);
  if (!pending) {
    pending = displayFetch('/api/system/address')
      .then((r) => (r.ok ? (r.json() as Promise<HubAddressResponse>) : null))
      .then((body) => body?.origin || own)
      .catch(() => own);
  }
  return pending;
}

/** Test hook: forget the shared lookup so the next `useOrigin` fetches again. */
export function __resetOriginForTests() {
  pending = null;
}
