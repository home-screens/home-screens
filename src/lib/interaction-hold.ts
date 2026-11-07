'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Per-tab holds that pause screen rotation while someone is using the display.
 *
 * Two kinds, because a person reading and a person tapping want different
 * things from a flick:
 * - An interaction hold (an open overlay such as a recipe) lasts for the
 *   lifetime of the component that took it. Counter-based so overlapping
 *   holds compose; it ends only when every one is released, and an overlay's
 *   own auto-dismiss timers bound how long it can last. It pauses the
 *   rotation timer and turns flick navigation off: the finger is on the
 *   overlay, not on the screen behind it.
 * - A tap hold follows a tap on a control and expires on its own. It pauses
 *   only the rotation timer. Someone who ticks a chore and then flicks wants
 *   the next screen, and a flick is one of the ways a held display is
 *   unstuck, so it must never swallow one.
 */

let overlayCount = 0;
let tapHeld = false;
let awakeCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function acquireInteractionHold(): () => void {
  overlayCount += 1;
  if (overlayCount === 1) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    overlayCount -= 1;
    if (overlayCount === 0) emit();
  };
}

function setTapHeld(next: boolean) {
  if (tapHeld === next) return;
  tapHeld = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isInteractionHeld = () => overlayCount > 0;
const isRotationHeld = () => overlayCount > 0 || tapHeld;
const serverIsHeld = () => false;

/** True while a component holds the display. Outside React, for tests. */
export function interactionIsHeld(): boolean {
  return isInteractionHeld();
}

/** True while a component or a recent tap holds rotation. Outside React, for tests. */
export function rotationIsHeld(): boolean {
  return isRotationHeld();
}

/** The single timed hold, so repeated taps extend one window instead of stacking. */
let tapTimer: ReturnType<typeof setTimeout> | null = null;
/** When the timed hold ends (`Date.now()` time), so a short hold never cuts a longer one short. */
let tapUntil = 0;

/**
 * Hold the rotation timer for `ms` after a deliberate touch.
 *
 * A screen change used to land in the middle of someone using it: the chart a
 * finger was heading for became page background and the tap produced nothing,
 * with the next chance to tick a chore two minutes away. A tap on a control is
 * a person standing at the display, so the screen stays put for a moment
 * afterwards and then gets a fresh dwell.
 *
 * Unlike `useInteractionHold` this is not tied to a component's lifetime, so a
 * second tap extends the same window rather than opening another, and it
 * leaves flick navigation alone. A shorter hold inside a longer one leaves the
 * longer end in place: a chip tapped while browsing recipes (eight seconds)
 * must not cut the minute the browsing earned. Returns a release for a caller
 * that wants to end it early.
 */
export function holdRotationFor(ms: number): () => void {
  if (ms <= 0) return () => {};
  const end = () => {
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
    tapUntil = 0;
    setTapHeld(false);
  };
  const until = Date.now() + ms;
  if (tapTimer && until <= tapUntil) return end;
  if (tapTimer) clearTimeout(tapTimer);
  tapUntil = until;
  setTapHeld(true);
  tapTimer = setTimeout(end, ms);
  return end;
}

/**
 * End the timed hold now. For a navigation that leaves the surface the hold
 * was earned on (the way back from an opened screen): the screen the display
 * returns to gets its own dwell, not the minute a flick on a list earned.
 */
export function releaseRotationHold(): void {
  if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
  tapUntil = 0;
  setTapHeld(false);
}

/**
 * True while a component holds the display. ScreenRotator turns flick
 * navigation off for it, as well as the rotation timer.
 */
export function useInteractionHeld(): boolean {
  return useSyncExternalStore(subscribe, isInteractionHeld, serverIsHeld);
}

/**
 * True while anything holds the rotation timer: a component, or a tap on a
 * control in the last few seconds. Read by ScreenRotator's rotation timer.
 */
export function useRotationHeld(): boolean {
  return useSyncExternalStore(subscribe, isRotationHeld, serverIsHeld);
}

/** Hold rotation and flick navigation for the lifetime of the calling component. */
export function useInteractionHold(): void {
  useEffect(() => acquireInteractionHold(), []);
}

/**
 * Cooking mode: a recipe someone is cooking from keeps the screen from
 * dimming or sleeping for nobody touching it. Hands in dough do not tap the
 * wall, and a dark screen in the middle of a recipe is the moment someone
 * reaches for a phone instead. Held only while `active` (the recipe card
 * turns it on with the first tick or step, so a card opened by accident never
 * keeps the wall awake). Read by the sleep manager's idle clock only: a sleep
 * schedule still wins, and the component taking it bounds how long it lasts
 * (the recipe card closes itself after an hour).
 */
export function useStayAwakeHold(active = true): void {
  useEffect(() => {
    if (!active) return;
    awakeCount += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      awakeCount -= 1;
    };
  }, [active]);
}

/** True while something open asks the screen to stay awake (`useStayAwakeHold`). */
export function stayAwakeIsHeld(): boolean {
  return awakeCount > 0;
}
