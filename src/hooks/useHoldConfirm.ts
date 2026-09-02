import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseHoldConfirmOptions {
  durationMs: number;
  onConfirm: () => void;
  /** How long `releasedEarly` stays true after a short tap. */
  earlyHintMs?: number;
}

export interface UseHoldConfirmResult {
  /** 0..1 progress value for UI rendering. */
  progress: number;
  /** Whether a hold is currently in progress. */
  isHolding: boolean;
  /**
   * True for a moment after the finger lifted before the hold completed, so
   * the button can say "keep holding" instead of silently doing nothing.
   */
  releasedEarly: boolean;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}

// ─── Testable timing core ────────────────────────────────────────────────────

interface HoldTimerOptions {
  durationMs: number;
  onConfirm: () => void;
  onProgress: (progress: number) => void;
}

interface HoldTimer {
  start: () => void;
  /** Release. Returns true when a hold was still in progress (a short tap). */
  stop: () => boolean;
  /** Browser took the pointer away (scroll, palm): reset without reporting a short tap. */
  cancel: () => void;
}

/**
 * Pure timing core for hold-to-confirm.  Exposed as a static property so
 * unit tests can drive it directly without a React renderer.
 *
 * Uses setInterval (16 ms ticks ≈ 60 fps) so Vitest fake-timers can
 * advance it deterministically in a `node` environment.
 */
function createHoldTimer({ durationMs, onConfirm, onProgress }: HoldTimerOptions): HoldTimer {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let completionId: ReturnType<typeof setTimeout> | null = null;
  let startTime: number | null = null;
  let fired = false;
  let stopped = false;

  function tick() {
    if (startTime === null || stopped) return;
    const elapsed = Date.now() - startTime;
    const p = Math.min(1, elapsed / durationMs);
    onProgress(p);
  }

  function complete() {
    if (fired || stopped) return;
    fired = true;
    cleanup(false);
    onProgress(1);
    onConfirm();
  }

  function cleanup(resetProgress: boolean) {
    stopped = true;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (completionId !== null) {
      clearTimeout(completionId);
      completionId = null;
    }
    startTime = null;
    if (resetProgress) onProgress(0);
  }

  return {
    start() {
      if (intervalId !== null) return; // already running
      fired = false;
      stopped = false;
      startTime = Date.now();
      // Progress ticks at ~60fps for smooth UI
      intervalId = setInterval(tick, 16);
      // Guaranteed completion at exactly durationMs
      completionId = setTimeout(complete, durationMs);
    },
    stop() {
      const interrupted = startTime !== null && !fired;
      cleanup(true);
      return interrupted;
    },
    cancel() {
      cleanup(true);
    },
  };
}

// ─── React hook ──────────────────────────────────────────────────────────────

/**
 * Hold-to-confirm primitive. Caller wires handlers to a button element and
 * renders any UI they want driven by `progress` (e.g. a ring fill).
 *
 * onConfirm fires exactly once per completed hold; re-triggering requires a
 * release + re-press cycle.
 */
export function useHoldConfirm(options: UseHoldConfirmOptions): UseHoldConfirmResult {
  const { durationMs, onConfirm, earlyHintMs = 1500 } = options;
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [releasedEarly, setReleasedEarly] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
  }, []);

  // Keep stable refs so the timer callbacks don't go stale
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const timerRef = useRef<HoldTimer | null>(null);

  // (Re-)create timer when durationMs changes
  useEffect(() => {
    timerRef.current = createHoldTimer({
      durationMs,
      onConfirm: () => {
        setIsHolding(false);
        onConfirmRef.current();
      },
      onProgress: (p) => {
        setProgress(p);
        if (p === 0) setIsHolding(false);
      },
    });
    return () => {
      timerRef.current?.stop();
    };
  }, [durationMs]);

  const onPointerDown = useCallback(() => {
    setIsHolding(true);
    timerRef.current?.start();
  }, []);

  const onPointerUp = useCallback(() => {
    if (!timerRef.current?.stop()) return;
    setReleasedEarly(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      hintTimerRef.current = null;
      setReleasedEarly(false);
    }, earlyHintMs);
  }, [earlyHintMs]);

  const onPointerCancel = useCallback(() => {
    timerRef.current?.cancel();
  }, []);

  return { progress, isHolding, releasedEarly, onPointerDown, onPointerUp, onPointerCancel };
}

// Expose timing core for unit tests (node env, no React renderer available)
useHoldConfirm._createHoldTimer = createHoldTimer;
