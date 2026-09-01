'use client';

import { useEffect, useState } from 'react';

/**
 * The browser's own origin, or `''` until after mount.
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
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}
