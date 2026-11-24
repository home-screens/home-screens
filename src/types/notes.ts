/**
 * The family notes board, stored in `data/notes.json` (see `lib/notes-data.ts`).
 *
 * A note is typed on the phone, carries who wrote it, and shows on the wall
 * until it expires. Notes are family data the way lists and chores are: the
 * phone remote, the wall and the editor all read this one store, and a Notes
 * module never carries notes of its own, so one board can sit on any number
 * of screens in any of its views.
 */

/**
 * How long a note stays on the wall, counted from when it was posted (or
 * from the moment the life was last changed). `keep` never expires.
 */
export type NoteLife = '12h' | '1d' | '3d' | '7d' | 'keep';

/** A pen colour. `ink` is whatever the surface writes in (white on a dark card, chalk, marker); the rest are fixed. */
export type NoteInk = 'ink' | 'red' | 'orange' | 'green' | 'blue' | 'purple';

/** Every pen colour, in the order the wall's drawing sheet offers them. */
export const NOTE_INKS: readonly NoteInk[] = ['ink', 'red', 'orange', 'green', 'blue', 'purple'];

/** One line of a drawing: a finger down, moved, and lifted. */
export interface NoteDrawingLine {
  /** The pen's colour. */
  c: NoteInk;
  /** The pen: 0 thin, 1 thick. */
  w: 0 | 1;
  /** The points as `x0, y0, x1, y1, ...`, whole numbers on the `NOTE_PAGE` page. One point is a dot. */
  p: number[];
}

/**
 * A note drawn on the wall with a finger. Kept as its lines, not as a
 * picture, so each view draws it in its own ink and at its own size (rules
 * in `lib/note-drawing.ts`).
 */
export interface NoteDrawing {
  lines: NoteDrawingLine[];
}

/** The page every drawing is made on: 4 wide by 3 tall. */
export const NOTE_PAGE = { width: 1000, height: 750 } as const;

/** How much one drawing may hold; the wall's sheet stops the pens at these. */
export const NOTE_DRAWING_LIMITS = {
  maxLines: 400,
  maxPoints: 6000,
} as const;

export interface Note {
  id: string;
  /**
   * Plain text, trimmed, at most `NOTES_LIMITS.maxTextLength` characters. No Markdown.
   * Empty for a drawing, which has `drawing` in its place.
   */
  text: string;
  /** The lines of a note drawn on the wall. A note has words or a drawing, never both. */
  drawing?: NoteDrawing;
  /**
   * The family member who wrote it (see `types/family.ts`). Unset when the
   * note was posted as nobody in particular, or when its author has since
   * been removed from the family: the note stays, the wall says "Someone".
   */
  authorId?: string;
  /** Sorts to the top of every view that sorts, and is marked with a pin. */
  pinned: boolean;
  /** Drawn in the danger tint in every view, for the dentist and the bus. */
  important: boolean;
  /** The preset the expiry was worked out from, so an edit sheet can show which is on. */
  life: NoteLife;
  createdAt: string;
  updatedAt: string;
  /**
   * ISO instant the note leaves the wall, or null for `keep`. Stored, not
   * derived, so "take it down now" is a plain write and a read never
   * computes dates. A note whose `expiresAt` is in the past is "gone": it
   * stays readable on the phone for `NOTES_GONE_KEEP_MS`, then is swept.
   */
  expiresAt: string | null;
}

export interface NotesData {
  notes: Note[];
}

/** Limits enforced by the store; the phone and editor surfaces mirror them. */
export const NOTES_LIMITS = {
  maxTextLength: 500,
  maxNotes: 200,
} as const;

/** Every preset, in the order the phone's "Show for" row shows them. */
export const NOTE_LIVES: readonly NoteLife[] = ['12h', '1d', '3d', '7d', 'keep'];

const HOUR_MS = 60 * 60 * 1000;

/** The span each timed preset stands for. */
export const NOTE_LIFE_MS: Record<Exclude<NoteLife, 'keep'>, number> = {
  '12h': 12 * HOUR_MS,
  '1d': 24 * HOUR_MS,
  '3d': 3 * 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
};

/** The preset a new note gets when none is picked. */
export const DEFAULT_NOTE_LIFE: NoteLife = '1d';

/** How long an expired note stays in the store (and the phone's Gone group) before the next write sweeps it. */
export const NOTES_GONE_KEEP_MS = 7 * 24 * HOUR_MS;
