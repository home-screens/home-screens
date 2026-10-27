import { NotesError } from './notes-errors';
import { expiryFor, isGone, isLive, isSweepable } from './notes-rules';
import { uuid } from './uuid';
import { DEFAULT_NOTE_LIFE, NOTE_LIVES, NOTES_LIMITS, type Note, type NoteLife, type NotesData } from '@/types/notes';

/**
 * What each phone action does to the board, as pure functions over
 * `NotesData`. The routes run them inside `updateNotesData`; the phone's
 * optimistic layer mirrors them so what a parent sees before the request
 * lands is what the store will hold after it.
 */

export interface CreateNoteInput {
  text: string;
  authorId?: string | null;
  life?: NoteLife;
  pinned?: boolean;
  important?: boolean;
}

export interface NotePatch {
  text?: string;
  /** `null` clears the author ("Nobody"). */
  authorId?: string | null;
  /** Counted from now, not from when the note was posted, even when it is the preset already on. Send it only when a preset was tapped. */
  life?: NoteLife;
  pinned?: boolean;
  important?: boolean;
}

export type NoteAction = 'take-down' | 'repost';

const LIVES: ReadonlySet<NoteLife> = new Set(NOTE_LIVES);

function cleanText(raw: unknown): string {
  if (typeof raw !== 'string') throw new NotesError(400, 'Write something first.');
  const text = raw.trim();
  if (!text) throw new NotesError(400, 'Write something first.');
  if (text.length > NOTES_LIMITS.maxTextLength) throw new NotesError(400, `A note can be ${NOTES_LIMITS.maxTextLength} characters at most.`);
  return text;
}

function cleanAuthor(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') throw new NotesError(400, 'The author must be a family member.');
  return raw;
}

function cleanLife(raw: unknown, fallback: NoteLife): NoteLife {
  if (raw === undefined) return fallback;
  if (!LIVES.has(raw as NoteLife)) throw new NotesError(400, 'Pick how long the note should stay.');
  return raw as NoteLife;
}

function cleanFlag(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'boolean') throw new NotesError(400, 'Pinned and important must be on or off.');
  return raw;
}

function find(data: NotesData, id: string): Note {
  const note = data.notes.find((n) => n.id === id);
  if (!note) throw new NotesError(404, 'That note is no longer here.');
  return note;
}

function replace(data: NotesData, next: Note): NotesData {
  return { ...data, notes: data.notes.map((n) => (n.id === next.id ? next : n)) };
}

/**
 * Post a note. A full board first lets go of its gone notes, oldest expiry
 * first; a board full of live notes refuses, because silently dropping a
 * note somebody can still read on the wall is worse than saying so.
 */
export function createNote(data: NotesData, input: CreateNoteInput, now: Date): { data: NotesData; note: Note } {
  const text = cleanText(input.text);
  const authorId = cleanAuthor(input.authorId);
  const life = cleanLife(input.life, DEFAULT_NOTE_LIFE);
  const pinned = cleanFlag(input.pinned, false);
  const important = cleanFlag(input.important, false);
  let notes = data.notes;
  if (notes.length >= NOTES_LIMITS.maxNotes) {
    const gone = notes.filter((n) => isGone(n, now) || isSweepable(n, now)).sort((a, b) => Date.parse(a.expiresAt ?? '') - Date.parse(b.expiresAt ?? ''));
    const drop = new Set(gone.slice(0, notes.length - NOTES_LIMITS.maxNotes + 1).map((n) => n.id));
    notes = notes.filter((n) => !drop.has(n.id));
    if (notes.length >= NOTES_LIMITS.maxNotes) throw new NotesError(409, `The board is full: ${NOTES_LIMITS.maxNotes} notes. Take some down first.`);
  }
  const at = now.toISOString();
  const note: Note = {
    id: uuid(),
    text,
    ...(authorId ? { authorId } : {}),
    pinned,
    important,
    life,
    createdAt: at,
    updatedAt: at,
    expiresAt: expiryFor(life, now),
  };
  return { data: { ...data, notes: [...notes, note] }, note };
}

/** Change a note's text, author, flags or life. Only a `life` in the patch moves the expiry. */
export function updateNote(data: NotesData, id: string, patch: NotePatch, now: Date): NotesData {
  const current = find(data, id);
  const next: Note = { ...current };
  if (patch.text !== undefined) next.text = cleanText(patch.text);
  if (patch.authorId !== undefined) {
    const authorId = cleanAuthor(patch.authorId);
    if (authorId) next.authorId = authorId;
    else delete next.authorId;
  }
  if (patch.pinned !== undefined) next.pinned = cleanFlag(patch.pinned, current.pinned);
  if (patch.important !== undefined) next.important = cleanFlag(patch.important, current.important);
  // A life in the patch means "from now", whether or not it is the same
  // preset: tapping "1 day" again on the phone restarts the day. The phone
  // sends `life` only when a preset was tapped, so a plain text edit never
  // moves the expiry.
  if (patch.life !== undefined) {
    const life = cleanLife(patch.life, current.life);
    next.life = life;
    next.expiresAt = expiryFor(life, now);
  }
  next.updatedAt = now.toISOString();
  return replace(data, next);
}

/** Take a note off the wall now. It becomes gone, and the phone can bring it back with `repost`. */
export function takeDown(data: NotesData, id: string, now: Date): NotesData {
  const current = find(data, id);
  if (!isLive(current, now)) return data;
  return replace(data, { ...current, expiresAt: now.toISOString(), updatedAt: now.toISOString() });
}

/** Put a gone note back on the wall: posted now, with the life it had. */
export function repost(data: NotesData, id: string, now: Date): NotesData {
  const current = find(data, id);
  const at = now.toISOString();
  return replace(data, { ...current, createdAt: at, updatedAt: at, expiresAt: expiryFor(current.life, now) });
}

export function deleteNote(data: NotesData, id: string): NotesData {
  find(data, id);
  return { ...data, notes: data.notes.filter((n) => n.id !== id) };
}
