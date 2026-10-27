import { createJsonStore } from './json-store';
import { withDataTransaction } from './data-transaction';
import { isSweepable } from './notes-rules';
import { NOTE_LIVES, NOTES_LIMITS, type NoteLife, type NotesData } from '@/types/notes';

/**
 * The family notes board: `data/notes.json`.
 *
 * Family data like lists and chores: the phone remote and the editor write
 * it, every wall reads it, and a Notes module only picks a view. Writes go
 * through the data transaction so a family change or a backup restore can
 * never interleave with a post.
 */

export const NOTES_FILE = 'data/notes.json';

const EMPTY: NotesData = { notes: [] };

const store = createJsonStore<NotesData>({
  path: NOTES_FILE,
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

/** Whole-file write, for a backup restore. Everything else goes through `updateNotesData`. */
export const writeNotesData = store.write;

export { NotesError } from './notes-errors';

const LIVES: ReadonlySet<NoteLife> = new Set(NOTE_LIVES);

/**
 * Shape check for a document about to be written whole (a backup restore).
 * Returns a plain-language reason, or null when the shape is sound.
 */
export function validateNotesData(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Notes must be an object with a notes array';
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.notes)) return 'Notes must be an object with a notes array';
  if (data.notes.length > NOTES_LIMITS.maxNotes) return `Notes: at most ${NOTES_LIMITS.maxNotes} notes`;
  const ids = new Set<string>();
  for (const [i, entry] of (data.notes as unknown[]).entries()) {
    const where = `Note ${i + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `${where} must be an object`;
    const note = entry as Record<string, unknown>;
    if (typeof note.id !== 'string' || !note.id) return `${where} is missing its id`;
    if (ids.has(note.id)) return `${where} repeats the id of another note`;
    ids.add(note.id);
    if (typeof note.text !== 'string' || !note.text.trim()) return `${where} is missing its text`;
    if (note.text.length > NOTES_LIMITS.maxTextLength) return `${where}: text is longer than ${NOTES_LIMITS.maxTextLength} characters`;
    if (note.authorId !== undefined && (typeof note.authorId !== 'string' || !note.authorId)) return `${where}: authorId must be an id`;
    if (typeof note.pinned !== 'boolean') return `${where}: pinned must be true or false`;
    if (typeof note.important !== 'boolean') return `${where}: important must be true or false`;
    if (!LIVES.has(note.life as NoteLife)) return `${where}: life must be one of ${NOTE_LIVES.join(', ')}`;
    for (const key of ['createdAt', 'updatedAt'] as const) {
      if (typeof note[key] !== 'string' || Number.isNaN(Date.parse(note[key] as string))) return `${where} is missing ${key}`;
    }
    if (note.expiresAt !== null && (typeof note.expiresAt !== 'string' || Number.isNaN(Date.parse(note.expiresAt)))) {
      return `${where}: expiresAt must be a timestamp or null`;
    }
  }
  return null;
}

/** Drop notes that have been gone for longer than the keep window. Returns the input when nothing changed. */
export function sweepGone(data: NotesData, now: Date): NotesData {
  const kept = data.notes.filter((n) => !isSweepable(n, now));
  return kept.length === data.notes.length ? data : { ...data, notes: kept };
}

async function readNotesDataUnlocked(): Promise<NotesData> {
  return store.read();
}

/**
 * Atomic read-modify-write. The sweep runs on the mutator's input, so a
 * post that lands on a board full of week-old gone notes starts from the
 * cleared board; the sweep alone forces a write, and a mutator returning
 * its input unchanged skips the disk otherwise.
 */
async function updateNotesDataUnlocked(
  mutator: (current: NotesData) => NotesData | Promise<NotesData>,
): Promise<NotesData> {
  return store.updateAtomic(async (current) => {
    const swept = sweepGone(current, new Date());
    const result = await mutator(swept);
    if (result === swept && swept === current) return current;
    return result;
  });
}

/** Every note, live and gone, as stored. Reads never write; expiry is a function of time, not of the file. */
export function readNotesData(): Promise<NotesData> {
  return withDataTransaction(readNotesDataUnlocked);
}

export function updateNotesData(mutator: (current: NotesData) => NotesData | Promise<NotesData>): Promise<NotesData> {
  return withDataTransaction(() => updateNotesDataUnlocked(mutator));
}
