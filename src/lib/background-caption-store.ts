import { useSyncExternalStore } from 'react';
import type { PictureCredit } from '@/lib/art-presentation';

export type BackgroundCaption = PictureCredit;

const captions = new Map<string, BackgroundCaption>();
const listeners = new Set<() => void>();

// A painting's label settings can change while the picture stays, so the whole caption is compared.
const same = (a: BackgroundCaption | undefined, b: BackgroundCaption | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function setBackgroundCaption(screenId: string, caption: BackgroundCaption | null | undefined): void {
  if (same(captions.get(screenId), caption)) return;
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
