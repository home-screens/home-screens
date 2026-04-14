'use client';

import { usePathname } from 'next/navigation';

const DISPLAY_ROUTE_RE = /^\/display\/([^/]+)\/?$/;

/**
 * Resolve the current display id from the URL, or `undefined` for the legacy
 * `/display` route, the editor, or any other non-display context. Used by the
 * DisplayControlModule when `defaultTarget === 'self'`.
 */
export function useDisplayId(): string | undefined {
  const pathname = usePathname();
  if (!pathname) return undefined;
  const match = pathname.match(DISPLAY_ROUTE_RE);
  return match?.[1];
}
