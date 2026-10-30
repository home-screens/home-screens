'use client';

import { useSyncExternalStore } from 'react';

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
/** A toast with a button stays long enough to read it and reach the button. */
const ACTION_MS = 7_000;

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
