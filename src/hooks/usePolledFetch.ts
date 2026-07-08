'use client';

import { useEffect, useRef } from 'react';

type PollFn = (isMounted: () => boolean) => void | Promise<void>;

interface UsePolledFetchOptions {
  /** Poll interval in ms. Omit for a one-shot fetch on setup with no interval. */
  intervalMs?: number;
  /** When false, skip the fetch and interval entirely. Defaults to true. */
  enabled?: boolean;
  /** Runs when disabled instead of polling — use to reset state (e.g. clear the last value). */
  onSkip?: () => void;
  /** Runs synchronously at the start of each active effect run, before the first fetch (e.g. reset stale state on a key change). */
  onSetup?: () => void;
}

/**
 * The shared "mounted-guard + immediate fetch + optional interval poll" effect
 * that editor polling hooks (useBackupReminder, useUpdateNotification,
 * useActiveBackground, useDisplaySharedState) each hand-rolled. The `poll`
 * callback receives an `isMounted()` guard and is read through a ref, so the
 * effect only re-runs when `deps`, `enabled`, or `intervalMs` change — the
 * caller lists just the values its poll body depends on.
 */
export function usePolledFetch(
  poll: PollFn,
  deps: React.DependencyList,
  options: UsePolledFetchOptions = {},
): void {
  const { intervalMs, enabled = true, onSkip, onSetup } = options;

  const pollRef = useRef(poll);
  const onSkipRef = useRef(onSkip);
  const onSetupRef = useRef(onSetup);
  pollRef.current = poll;
  onSkipRef.current = onSkip;
  onSetupRef.current = onSetup;

  useEffect(() => {
    if (!enabled) {
      onSkipRef.current?.();
      return;
    }

    let mounted = true;
    const isMounted = () => mounted;

    onSetupRef.current?.();

    const run = () => pollRef.current(isMounted);
    run();
    const id = intervalMs ? setInterval(run, intervalMs) : undefined;
    return () => {
      mounted = false;
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks are read via refs; only these values should retrigger the poll loop
  }, [...deps, enabled, intervalMs]);
}
