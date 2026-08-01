'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Per-tab hold counter that pauses screen rotation while someone is
 * mid-interaction (e.g. reading a recipe overlay). Counter-based so
 * overlapping holds compose; rotation resumes only when every hold is
 * released. Holders release via cleanup on unmount, so an interaction
 * component's own auto-dismiss timers bound how long rotation can stall.
 */

let holdCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function acquireInteractionHold(): () => void {
  holdCount += 1;
  if (holdCount === 1) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holdCount -= 1;
    if (holdCount === 0) emit();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isHeld = () => holdCount > 0;
const serverIsHeld = () => false;

/** True while any component holds rotation. Read by ScreenRotator. */
export function useInteractionHeld(): boolean {
  return useSyncExternalStore(subscribe, isHeld, serverIsHeld);
}

/** Hold rotation for the lifetime of the calling component. */
export function useInteractionHold(): void {
  useEffect(() => acquireInteractionHold(), []);
}
