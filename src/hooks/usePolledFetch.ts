'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Why a poll is running: the hooks that read loudly once and quietly after tell the first run apart. */
export type PollReason =
  /** The effect started: a mount, or a dependency changed. */
  | 'setup'
  | 'interval'
  /** The tab came back into view (only with `pauseWhenHidden`). */
  | 'visible'
  /** The device is back online. */
  | 'online'
  /** `nudge()` was called. */
  | 'nudge';

type PollFn = (isMounted: () => boolean, reason: PollReason) => void | Promise<void>;

interface UsePolledFetchOptions {
  /** Poll interval in ms. Omit for a one-shot fetch on setup with no interval. */
  intervalMs?: number;
  /** When false, skip the fetch and interval entirely. Defaults to true. */
  enabled?: boolean;
  /** Runs when disabled instead of polling, to reset state (clear the last value, say). */
  onSkip?: () => void;
  /** Runs synchronously at the start of each active effect run, before the first fetch (reset stale state on a key change, say). */
  onSetup?: () => void;
  /**
   * Stop the interval while the tab is hidden and resume (with an immediate
   * fetch) when it becomes visible again. Use for polls that only feed
   * on-screen UI, so a background editor tab or a phone left on /remote
   * does not keep hitting the hub Pi. Only meaningful together with `intervalMs`.
   */
  pauseWhenHidden?: boolean;
  /**
   * How `nudge()` polls: every `intervalMs` for `durationMs`, then back to
   * the base interval. Defaults to once a second for ten seconds, enough to
   * watch a display act on a command.
   */
  burst?: { intervalMs: number; durationMs: number };
}

const DEFAULT_BURST = { intervalMs: 1_000, durationMs: 10_000 };

interface Loop {
  nudge: () => void;
}

/**
 * The shared "mounted-guard + immediate fetch + optional interval poll"
 * effect behind every polling hook. The `poll` callback receives an
 * `isMounted()` guard and why it is running, and is read through a ref, so
 * the effect only re-runs when `deps`, `enabled`, or `intervalMs` change:
 * the caller lists just the values its poll body depends on.
 *
 * Every active loop also polls again when the device comes back online, so
 * a load that failed during a Wi-Fi blip does not leave the page stale until
 * the next tick. `nudge()` polls now and then in a burst, for a phone that
 * just sent a command and wants to see the display act on it.
 */
export function usePolledFetch(
  poll: PollFn,
  deps: React.DependencyList,
  options: UsePolledFetchOptions = {},
): { nudge: () => void } {
  const { intervalMs, enabled = true, onSkip, onSetup, pauseWhenHidden = false, burst = DEFAULT_BURST } = options;

  const pollRef = useRef(poll);
  const onSkipRef = useRef(onSkip);
  const onSetupRef = useRef(onSetup);
  const burstRef = useRef(burst);
  pollRef.current = poll;
  onSkipRef.current = onSkip;
  onSetupRef.current = onSetup;
  burstRef.current = burst;
  // The running loop, so `nudge` (stable) can reach the one the effect made.
  const loopRef = useRef<Loop | null>(null);

  useEffect(() => {
    if (!enabled) {
      onSkipRef.current?.();
      return;
    }

    let mounted = true;
    const isMounted = () => mounted;

    onSetupRef.current?.();

    const run = (reason: PollReason) => pollRef.current(isMounted, reason);

    // No `typeof document` guards: useEffect is client-only in a 'use client'
    // module, so `document` and `window` are always defined here.
    let running = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let burstEnd: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number | undefined) => {
      if (timer !== null) clearInterval(timer);
      timer = ms ? setInterval(() => run('interval'), ms) : null;
    };
    const endBurst = () => {
      if (burstEnd !== null) clearTimeout(burstEnd);
      burstEnd = null;
    };
    const start = (reason: PollReason) => {
      if (running) return;
      running = true;
      run(reason);
      schedule(intervalMs);
    };
    const stop = () => {
      running = false;
      schedule(undefined);
      endBurst();
    };
    const visible = () => !pauseWhenHidden || document.visibilityState === 'visible';
    const onVisibilityChange = () => {
      if (visible()) start('visible');
      else stop();
    };
    const onOnline = () => {
      if (running) run('online');
    };

    loopRef.current = {
      nudge: () => {
        // A one-shot has nothing to speed up; a paused loop polls when it resumes.
        if (!running || !intervalMs) return;
        run('nudge');
        schedule(burstRef.current.intervalMs);
        endBurst();
        burstEnd = setTimeout(() => {
          burstEnd = null;
          if (running) schedule(intervalMs);
        }, burstRef.current.durationMs);
      },
    };

    if (visible()) start('setup');
    if (pauseWhenHidden) document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    return () => {
      mounted = false;
      stop();
      loopRef.current = null;
      if (pauseWhenHidden) document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks are read via refs; only these values should retrigger the poll loop
  }, [...deps, enabled, intervalMs, pauseWhenHidden]);

  const nudge = useCallback(() => loopRef.current?.nudge(), []);

  return { nudge };
}
