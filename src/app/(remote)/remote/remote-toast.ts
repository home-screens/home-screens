'use client';

import { useSyncExternalStore } from 'react';
import { UNDO_WINDOW_MS } from '@/lib/undo-window';

/**
 * One-line confirmations for the family remote ("Alert sent to Kitchen",
 * "Kitchen didn't respond"). A module-level store rather than context so any
 * component — a sheet, a card, a tab — can announce an outcome without
 * threading a callback through the tree. Only the newest toast shows; a
 * second announcement replaces the first rather than stacking.
 */
export interface RemoteToast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  /** One button beside the message, such as Undo; pressing it runs `onPress` and closes the toast. */
  action?: { label: string; onPress: () => void };
}

const INFO_MS = 3_500;
const ERROR_MS = 6_000;
/** A toast with a button (an Undo) stays as long as every surface's Undo does. */
const ACTION_MS = UNDO_WINDOW_MS;

let current: RemoteToast | null = null;
let counter = 0;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function showToast(message: string, tone: RemoteToast['tone'] = 'info', action?: RemoteToast['action']): void {
  clearTimeout(hideTimer);
  current = { id: ++counter, message, tone, ...(action ? { action } : {}) };
  emit();
  hideTimer = setTimeout(() => {
    current = null;
    emit();
  }, action ? ACTION_MS : tone === 'error' ? ERROR_MS : INFO_MS);
}

export function dismissToast(): void {
  clearTimeout(hideTimer);
  if (current === null) return;
  current = null;
  emit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useRemoteToast(): RemoteToast | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/**
 * How tall the panel of a full-screen overlay is (the photo viewer's), or
 * null. While set, the toast sits just above that panel instead of above the
 * tab bar, which the overlay covers and where its buttons are.
 */
let floor: number | null = null;
const floorListeners = new Set<() => void>();

export function setToastFloor(px: number | null): void {
  if (floor === px) return;
  floor = px;
  for (const fn of floorListeners) fn();
}

function subscribeFloor(fn: () => void): () => void {
  floorListeners.add(fn);
  return () => {
    floorListeners.delete(fn);
  };
}

export function useToastFloor(): number | null {
  return useSyncExternalStore(subscribeFloor, () => floor, () => null);
}

/**
 * How many sheets are up over a dimmed page. While any is, the toast goes to
 * the top of the screen: above the tab bar it lands on the sheet's own lower
 * rows (the meal sheet's serving time), and its Undo takes the tap meant for
 * the row under it. A count, since a sheet opens over a sheet (the dish
 * picker over a meal) and the first to close must not let go for both.
 */
let topHolds = 0;
const topHoldListeners = new Set<() => void>();

function setTopHolds(next: number): void {
  const was = topHolds > 0;
  topHolds = next;
  if (was === topHolds > 0) return;
  for (const fn of topHoldListeners) fn();
}

/** Keep the toast at the top of the screen until the returned release is called. */
export function holdToastAtTop(): () => void {
  setTopHolds(topHolds + 1);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    setTopHolds(topHolds - 1);
  };
}

export function toastHeldAtTop(): boolean {
  return topHolds > 0;
}

function subscribeTopHold(fn: () => void): () => void {
  topHoldListeners.add(fn);
  return () => {
    topHoldListeners.delete(fn);
  };
}

export function useToastHeldAtTop(): boolean {
  return useSyncExternalStore(subscribeTopHold, toastHeldAtTop, () => false);
}

/**
 * The edge the toast is pinned to. The photo viewer's floor comes first: the
 * viewer fills the screen and its panel is where the toast belongs, also
 * when a question is asked over it. Then a sheet's hold, then the tab bar
 * plus whatever bar the tab pins above it (`raisedBy`).
 */
export function toastPlacement(
  { floor, heldAtTop, raisedBy }: { floor: number | null; heldAtTop: boolean; raisedBy: number },
): { top: string } | { bottom: string } {
  if (floor !== null) return { bottom: `${floor + 12}px` };
  if (heldAtTop) return { top: 'calc(env(safe-area-inset-top, 0px) + 12px)' };
  return { bottom: `calc(5.75rem + ${raisedBy}px + env(safe-area-inset-bottom))` };
}
