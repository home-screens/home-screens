import { useSyncExternalStore } from 'react';

export interface BackgroundCaption { name: string; source: string }

const captions = new Map<string, BackgroundCaption>();
const listeners = new Set<() => void>();

export function setBackgroundCaption(screenId: string, caption: BackgroundCaption | null | undefined): void {
  const current = captions.get(screenId);
  if (current?.name === caption?.name && current?.source === caption?.source) return;
  if (caption) captions.set(screenId, caption);
  else captions.delete(screenId);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useBackgroundCaption(screenId: string): BackgroundCaption | undefined {
  return useSyncExternalStore(subscribe, () => captions.get(screenId), () => undefined);
}
