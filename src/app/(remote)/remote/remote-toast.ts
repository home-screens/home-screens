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
}

const INFO_MS = 3_500;
const ERROR_MS = 6_000;

let current: RemoteToast | null = null;
let counter = 0;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function showToast(message: string, tone: RemoteToast['tone'] = 'info'): void {
  clearTimeout(hideTimer);
  current = { id: ++counter, message, tone };
  emit();
  hideTimer = setTimeout(() => {
    current = null;
    emit();
  }, tone === 'error' ? ERROR_MS : INFO_MS);
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
