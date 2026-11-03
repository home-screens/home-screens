'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HubUnreachableError } from '@/lib/hub-request';
import { SLOW_DOWN_STEP_MS } from '@/lib/oauth-device-flow';

/**
 * The editor side of a device-code sign-in (Google Calendar, OneDrive, an
 * OAuth2 plugin): ask the hub to start one, show the code, poll the hub at
 * the interval it named until the sign-in ends, and survive the laptop
 * losing the hub for a moment on the way. Each surface brings its own
 * endpoints and its own words; the loop is the same for all three.
 */

export interface DeviceCodeStart {
  userCode: string;
  verificationUrl: string;
  /** How far apart the hub wants polls, from the provider. */
  intervalMs: number;
  /** How long the code stays good. */
  expiresInMs: number;
}

export type DeviceCodePoll =
  /** Still waiting; `slowDown` when the provider wants polls spaced further apart. */
  | { status: 'pending'; slowDown?: boolean }
  | { status: 'connected' }
  /** The sign-in ended without connecting; `message` is what the surface shows. */
  | { status: 'ended'; message: string };

export interface DeviceCodeSignInOptions {
  /**
   * Starts a flow at the hub. Throws with the sentence to show when the hub
   * refused to start one; a hub that could not be reached shows
   * `words.hubUnreachable`.
   */
  start: () => Promise<DeviceCodeStart>;
  /**
   * One poll of the hub. Throws when the hub could not be reached or gave
   * no readable answer, which counts as a miss: the loop keeps polling
   * until `MAX_CONSECUTIVE_MISSES` in a row.
   */
  poll: () => Promise<DeviceCodePoll>;
  onConnected: () => void | Promise<void>;
  words: {
    /** The code ran out before the sign-in finished. */
    codeExpired: string;
    /** The hub stopped answering for long enough to give up on this code. */
    hubUnreachable: string;
  };
}

export interface DeviceCodeSignIn {
  /** The code to type and where, while a sign-in is waiting. */
  code: { userCode: string; verificationUrl: string } | null;
  /** True from the start request until the sign-in ends one way or another. */
  busy: boolean;
  error: string | null;
  start: () => Promise<void>;
  /** Stop waiting for this code; it simply expires at the provider. */
  cancel: () => void;
  clearError: () => void;
}

/**
 * How many polls in a row may fail to reach the hub before the sign-in is
 * given up. A Wi-Fi blip is a poll or two; a hub that is gone for half a
 * minute at the provider's five-second spacing is not coming back for this
 * code.
 */
export const MAX_CONSECUTIVE_MISSES = 6;
/** Never poll faster than this, whatever the hub said. */
const MIN_POLL_MS = 1000;

export function useDeviceCodeSignIn(options: DeviceCodeSignInOptions): DeviceCodeSignIn {
  const [code, setCode] = useState<DeviceCodeSignIn['code']>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The surfaces pass fresh closures every render; reading them through a
  // ref keeps the loop on the latest ones without restarting it.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Every start (and cancel, and unmount) opens a new run; a timer or an
  // answer from an older run finds the number moved on and does nothing.
  const runRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => () => {
    runRef.current += 1;
    stopTimer();
  }, []);

  const start = useCallback(async () => {
    const run = ++runRef.current;
    stopTimer();
    setError(null);
    setCode(null);
    setBusy(true);

    let started: DeviceCodeStart;
    try {
      started = await optionsRef.current.start();
    } catch (err) {
      if (runRef.current !== run) return;
      setBusy(false);
      setError(err instanceof HubUnreachableError || !(err instanceof Error) || !err.message
        ? optionsRef.current.words.hubUnreachable
        : err.message);
      return;
    }
    if (runRef.current !== run) return;
    setCode({ userCode: started.userCode, verificationUrl: started.verificationUrl });

    const deadline = Date.now() + started.expiresInMs;
    let spacing = Math.max(started.intervalMs || 0, MIN_POLL_MS);
    let misses = 0;

    const end = (message: string | null) => {
      setCode(null);
      setBusy(false);
      if (message) setError(message);
    };

    const poll = async () => {
      if (runRef.current !== run) return;
      if (Date.now() > deadline) {
        end(optionsRef.current.words.codeExpired);
        return;
      }
      let outcome: DeviceCodePoll;
      try {
        outcome = await optionsRef.current.poll();
      } catch {
        if (runRef.current !== run) return;
        if (++misses >= MAX_CONSECUTIVE_MISSES) {
          end(optionsRef.current.words.hubUnreachable);
          return;
        }
        schedule();
        return;
      }
      if (runRef.current !== run) return;
      misses = 0;
      if (outcome.status === 'pending') {
        if (outcome.slowDown) spacing += SLOW_DOWN_STEP_MS;
        schedule();
        return;
      }
      if (outcome.status === 'connected') {
        end(null);
        await optionsRef.current.onConnected();
        return;
      }
      end(outcome.message);
    };

    const schedule = () => {
      timerRef.current = setTimeout(poll, spacing);
    };
    schedule();
  }, []);

  const cancel = useCallback(() => {
    runRef.current += 1;
    stopTimer();
    setCode(null);
    setBusy(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { code, busy, error, start, cancel, clearError };
}
