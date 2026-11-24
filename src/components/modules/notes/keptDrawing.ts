import { useSyncExternalStore } from 'react';
import type { NoteDrawingLine } from '@/types/notes';

/**
 * A page somebody left unfinished: the drawing sheet closed itself with
 * lines on it. The wall keeps it for a few minutes so the next tap on "Draw
 * a note" carries on where they stopped. One page per wall, in memory only:
 * every Notes card on the wall offers the same one, and a reload forgets it.
 */

/** How long an unfinished page waits to be picked up again. */
export const KEPT_DRAWING_MS = 10 * 60_000;

interface Kept { lines: NoteDrawingLine[]; at: number }

let kept: Kept | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: Kept | null): void {
  kept = next;
  if (timer) clearTimeout(timer);
  timer = next ? setTimeout(() => set(null), Math.max(0, next.at + KEPT_DRAWING_MS - Date.now())) : null;
  for (const listener of listeners) listener();
}

/** Keep an unfinished page from now. */
export function keepDrawing(lines: NoteDrawingLine[]): void {
  set(lines.length > 0 ? { lines, at: Date.now() } : null);
}

/** The page was posted, thrown away or picked up again. */
export function forgetKeptDrawing(): void {
  if (kept) set(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The unfinished page still waiting, or null. Re-renders when one is kept, picked up or runs out of time. */
export function useKeptDrawing(): NoteDrawingLine[] | null {
  const current = useSyncExternalStore(subscribe, () => kept, () => null);
  return current ? current.lines : null;
}
