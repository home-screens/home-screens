'use client';

import { useEffect, useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';

const log = logger('save');

interface UseDebouncedSaveOptions {
  /** Dependencies to watch. When any value in the array changes, schedule a save. */
  values: unknown[];
  /**
   * The save action. The hook calls this when the debounce window expires
   * (or when `flush()` is called manually). The caller owns endpoint, body
   * shape, and any post-save side effects (e.g. cache invalidation).
   */
  save: () => Promise<unknown> | unknown;
  /** Debounce window in ms. Default 400. */
  debounceMs?: number;
  /**
   * When false, the hook is dormant — no timer is scheduled and no values are
   * remembered. When this flips false → true, the next dependency change is
   * treated as the "initial" value (and skipped if `skipInitial` is true).
   * Default true.
   */
  enabled?: boolean;
  /**
   * Skip the first dependency-change effect after enable. Useful when initial
   * values come from a load and you don't want to round-trip them straight back
   * to the server. Default true.
   */
  skipInitial?: boolean;
  /**
   * If a save is pending in the debounce window when the component unmounts,
   * fire it immediately. Default false.
   */
  flushOnUnmount?: boolean;
  /**
   * Called with any error thrown by `save`.
   *
   * Defaults to logging rather than silence: a save that fails without a trace
   * shows the user their edit as applied while the server never received it.
   * Pass an explicit handler to surface it in the UI as well.
   *
   * Note `save` must *reject* to get here — chain `throwIfNotOk` from
   * `@/lib/editor-fetch` if you use `editorFetch`, which resolves for every
   * status except 401.
   */
  onError?: (err: unknown) => void;
}

interface UseDebouncedSaveReturn {
  /**
   * Synchronously cancel any pending save and run `save()` now (fire-and-forget).
   * Safe to call when no save is pending — it will just run the saver once.
   */
  flush: () => void;
}

/**
 * Pure state-machine for the debounce + initial-skip behavior. Exposed so it
 * can be tested without React (project test env is node, no jsdom).
 */
export function _createDebouncedSaver(opts: {
  debounceMs: number;
  skipInitial: boolean;
  run: () => void;
  setTimer: (cb: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}) {
  let timerHandle: unknown = null;
  let skipNext = opts.skipInitial;
  let wasEnabled = false;

  return {
    onChange(enabled: boolean) {
      if (!enabled) {
        if (timerHandle != null) {
          opts.clearTimer(timerHandle);
          timerHandle = null;
        }
        wasEnabled = false;
        skipNext = opts.skipInitial;
        return;
      }
      if (!wasEnabled) {
        wasEnabled = true;
        if (opts.skipInitial) {
          skipNext = false;
          return;
        }
      }
      if (skipNext) {
        skipNext = false;
        return;
      }
      if (timerHandle != null) opts.clearTimer(timerHandle);
      timerHandle = opts.setTimer(() => {
        timerHandle = null;
        opts.run();
      }, opts.debounceMs);
    },
    flush() {
      if (timerHandle != null) {
        opts.clearTimer(timerHandle);
        timerHandle = null;
      }
      opts.run();
    },
    hasPending() {
      return timerHandle != null;
    },
    cancel() {
      if (timerHandle != null) {
        opts.clearTimer(timerHandle);
        timerHandle = null;
      }
    },
  };
}

export function useDebouncedSave(options: UseDebouncedSaveOptions): UseDebouncedSaveReturn {
  const {
    values,
    save,
    debounceMs = 400,
    enabled = true,
    skipInitial = true,
    flushOnUnmount = false,
    onError,
  } = options;

  const saveRef = useRef(save);
  const onErrorRef = useRef(onError);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const runSave = useCallback(() => {
    const report = (err: unknown) => {
      if (onErrorRef.current) onErrorRef.current(err);
      else log.error('Debounced save failed:', err);
    };
    try {
      const result = saveRef.current();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).catch(report);
      }
    } catch (err) {
      report(err);
    }
  }, []);

  const saverRef = useRef<ReturnType<typeof _createDebouncedSaver> | null>(null);
  if (saverRef.current === null) {
    saverRef.current = _createDebouncedSaver({
      debounceMs,
      skipInitial,
      run: () => runSave(),
      setTimer: (cb, ms) => setTimeout(cb, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
  }

  useEffect(() => {
    saverRef.current?.onChange(enabled);
    // values are spread into deps below so each member is tracked individually
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...values]);

  useEffect(() => {
    return () => {
      const saver = saverRef.current;
      if (!saver) return;
      if (flushOnUnmount && saver.hasPending()) {
        saver.flush();
      } else {
        saver.cancel();
      }
    };
  }, [flushOnUnmount]);

  const flush = useCallback(() => {
    saverRef.current?.flush();
  }, []);

  return { flush };
}
