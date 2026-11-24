import { useSyncExternalStore } from 'react';
import type { NoteDrawingLine } from '@/types/notes';

/**
 * A note somebody left unfinished: the sheet closed itself with lines on
 * its page or words in its box. The wall keeps it for a few minutes so the
 * next tap on the card's button carries on where they stopped. One per
 * wall, in memory only: every Notes card on the wall offers the same one,
 * and a reload forgets it.
 */

/** How long an unfinished note waits to be picked up again. */
export const KEPT_NOTE_MS = 10 * 60_000;

/** What the sheet held when it closed: the page, the words, and which of the two was showing. */
export interface KeptNote {
  lines: NoteDrawingLine[];
  /** The words as typed, not trimmed. */
  text: string;
  mode: 'draw' | 'write';
}

interface Kept extends KeptNote { at: number }

let kept: Kept | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: Kept | null): void {
  kept = next;
  if (timer) clearTimeout(timer);
  timer = next ? setTimeout(() => set(null), Math.max(0, next.at + KEPT_NOTE_MS - Date.now())) : null;
  for (const listener of listeners) listener();
}

/** Whether there is anything on the page or in the box. */
export function hasKeptContent(note: Pick<KeptNote, 'lines' | 'text'>): boolean {
  return note.lines.length > 0 || note.text.trim() !== '';
}

/** Keep an unfinished note from now; one with nothing in it is forgotten. */
export function keepNote(note: KeptNote): void {
  set(hasKeptContent(note) ? { ...note, at: Date.now() } : null);
}

/** The note was posted, thrown away or picked up again. */
export function forgetKeptNote(): void {
  if (kept) set(null);
}

/** The unfinished note waiting right now, outside a render. */
export function currentKeptNote(): KeptNote | null {
  return kept;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The unfinished note still waiting, or null. Re-renders when one is kept, picked up or runs out of time. */
export function useKeptNote(): KeptNote | null {
  return useSyncExternalStore(subscribe, () => kept, () => null);
}
