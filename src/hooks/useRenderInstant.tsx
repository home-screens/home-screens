'use client';

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

/**
 * The instant the server rendered this page, in epoch milliseconds, so a clock
 * can hydrate with exactly the reading the server wrote.
 *
 * Why it matters: clock text carries `suppressHydrationWarning`, and React
 * never patches text it was told to forgive. It only patches a later render
 * whose value differs from the value it hydrated with. If a clock hydrates
 * with the browser's own instant, every part of that reading which the next
 * tick leaves unchanged keeps the server's text on screen. A kiosk rendered at
 * 8:59:57 and hydrated at 9:00:02 showed "8:01" at 9:01, and a page loaded
 * across midnight kept yesterday's date line for an hour. Hydrating with the
 * server's instant makes the first client render match the HTML, so the mount
 * tick's real reading differs wherever the screen is stale and React patches
 * exactly those parts.
 */
const RenderInstantContext = createContext<number | null>(null);

export function RenderInstantProvider({ instant, children }: { instant: number; children: ReactNode }) {
  return <RenderInstantContext.Provider value={instant}>{children}</RenderInstantContext.Provider>;
}

const subscribeNever = () => () => {};

/**
 * The instant a ticking clock should start from: the server's render instant
 * while this component is server-rendered or hydrated, and the real time for
 * any component mounted afterwards (a screen rotated in hours later must not
 * start from the page's load time). Without a provider it is always the real
 * time.
 */
export function useFirstRenderInstant(): () => Date {
  const serverInstant = useContext(RenderInstantContext);
  // true on the server and while hydrating, false for a client-side mount.
  const hydrating = useSyncExternalStore(subscribeNever, () => false, () => true);
  return hydrating && serverInstant !== null ? () => new Date(serverInstant) : () => new Date();
}
