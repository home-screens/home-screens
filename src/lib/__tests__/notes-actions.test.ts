import { describe, it, expect } from 'vitest';
import { createNote, deleteNote, repost, takeDown, updateNote, type CreateNoteInput, type NotePatch } from '../notes-actions';
import { NotesError } from '../notes-errors';
import { isGone, isLive } from '../notes-rules';
import { NOTES_LIMITS, type Note, type NotesData } from '@/types/notes';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-20T15:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    text: `Note ${id}`,
    pinned: false,
    important: false,
    life: '1d',
    createdAt: at(-10 * HOUR),
    updatedAt: at(-10 * HOUR),
    expiresAt: at(14 * HOUR),
    ...overrides,
  };
}

const board = (...notes: Note[]): NotesData => ({ notes });

/** Runs `fn` and returns the NotesError it threw, failing the test if it threw anything else or nothing. */
function notesError(fn: () => unknown): NotesError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(NotesError);
    return error as NotesError;
  }
  throw new Error('expected a NotesError');
}

function expectRefusal(fn: () => unknown, status: number, message: string) {
  const error = notesError(fn);
  expect(error.status).toBe(status);
  expect(error.message).toBe(message);
}

describe('createNote', () => {
  it('posts a trimmed note with a new id, appended to the board', () => {
    const data = board(note('a'));
    const { data: next, note: created } = createNote(data, { text: '  Dentist at 3:40  ' }, NOW);
    expect(created.text).toBe('Dentist at 3:40');
    expect(created.id).toEqual(expect.any(String));
    expect(created.id).not.toBe('a');
    expect(next.notes.map((n) => n.id)).toEqual(['a', created.id]);
    expect(next.notes[1]).toBe(created);
    expect(data.notes).toHaveLength(1);
  });

  it('gives every new note its own id', () => {
    const first = createNote(board(), { text: 'One' }, NOW).note;
    const second = createNote(board(), { text: 'Two' }, NOW).note;
    expect(first.id).not.toBe(second.id);
  });

  it('defaults to a day on the wall, unflagged, posted now', () => {
    const { note: created } = createNote(board(), { text: 'Tacos Friday?' }, NOW);
    expect(created).toEqual({
      id: created.id,
      text: 'Tacos Friday?',
      pinned: false,
      important: false,
      life: '1d',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      expiresAt: at(24 * HOUR),
    });
  });

  it('keeps a note with the keep life on the wall with no expiry', () => {
    const { note: created } = createNote(board(), { text: 'Wifi: hunter2', life: 'keep' }, NOW);
    expect(created.life).toBe('keep');
    expect(created.expiresAt).toBeNull();
  });

  it('counts each timed life from now', () => {
    expect(createNote(board(), { text: 'x', life: '12h' }, NOW).note.expiresAt).toBe(at(12 * HOUR));
    expect(createNote(board(), { text: 'x', life: '3d' }, NOW).note.expiresAt).toBe(at(3 * DAY));
    expect(createNote(board(), { text: 'x', life: '7d' }, NOW).note.expiresAt).toBe(at(7 * DAY));
  });

  it('carries the author and the flags it was given', () => {
    const { note: created } = createNote(board(), { text: 'Bus is late', authorId: 'mom', pinned: true, important: true }, NOW);
    expect(created).toMatchObject({ authorId: 'mom', pinned: true, important: true });
  });

  it('leaves the author off when it is empty or null', () => {
    expect('authorId' in createNote(board(), { text: 'x', authorId: '' }, NOW).note).toBe(false);
    expect('authorId' in createNote(board(), { text: 'x', authorId: null }, NOW).note).toBe(false);
    expect('authorId' in createNote(board(), { text: 'x' }, NOW).note).toBe(false);
  });

  it('refuses an empty note', () => {
    expectRefusal(() => createNote(board(), { text: '' }, NOW), 400, 'Write something first.');
    expectRefusal(() => createNote(board(), { text: '   \n\t ' }, NOW), 400, 'Write something first.');
    expectRefusal(() => createNote(board(), { text: 42 } as unknown as CreateNoteInput, NOW), 400, 'Write something first.');
    expectRefusal(() => createNote(board(), {} as CreateNoteInput, NOW), 400, 'Write something first.');
  });

  it('allows 500 characters and refuses 501, counted after trimming', () => {
    expect(createNote(board(), { text: 'x'.repeat(NOTES_LIMITS.maxTextLength) }, NOW).note.text).toHaveLength(500);
    expect(createNote(board(), { text: `  ${'x'.repeat(500)}  ` }, NOW).note.text).toHaveLength(500);
    expectRefusal(() => createNote(board(), { text: 'x'.repeat(501) }, NOW), 400, 'A note can be 500 characters at most.');
  });

  it('refuses a life that is not one of the presets', () => {
    expectRefusal(() => createNote(board(), { text: 'x', life: 'forever' } as unknown as CreateNoteInput, NOW), 400, 'Pick how long the note should stay.');
    expectRefusal(() => createNote(board(), { text: 'x', life: null } as unknown as CreateNoteInput, NOW), 400, 'Pick how long the note should stay.');
  });

  it('refuses flags that are not on or off', () => {
    expectRefusal(() => createNote(board(), { text: 'x', pinned: 'yes' } as unknown as CreateNoteInput, NOW), 400, 'Pinned and important must be on or off.');
    expectRefusal(() => createNote(board(), { text: 'x', important: 1 } as unknown as CreateNoteInput, NOW), 400, 'Pinned and important must be on or off.');
  });

  it('refuses an author that is not an id', () => {
    expectRefusal(() => createNote(board(), { text: 'x', authorId: 7 } as unknown as CreateNoteInput, NOW), 400, 'The author must be a family member.');
  });

  describe('on a full board', () => {
    const fullOfLive = () => Array.from({ length: NOTES_LIMITS.maxNotes }, (_, i) => note(`live-${i}`));

    it('lets go of the gone note with the oldest expiry to make room', () => {
      const notes = fullOfLive();
      notes[10] = note('gone-recent', { expiresAt: at(-HOUR) });
      notes[50] = note('gone-oldest', { expiresAt: at(-3 * DAY) });
      notes[90] = note('gone-middle', { expiresAt: at(-DAY) });
      const { data: next, note: created } = createNote(board(...notes), { text: 'New one' }, NOW);
      expect(next.notes).toHaveLength(NOTES_LIMITS.maxNotes);
      const ids = next.notes.map((n) => n.id);
      expect(ids).not.toContain('gone-oldest');
      expect(ids).toContain('gone-recent');
      expect(ids).toContain('gone-middle');
      expect(ids.at(-1)).toBe(created.id);
    });

    it('counts a note taken down this instant as gone', () => {
      const notes = fullOfLive();
      notes[0] = note('just-down', { expiresAt: at(0) });
      const { data: next } = createNote(board(...notes), { text: 'New one' }, NOW);
      expect(next.notes.map((n) => n.id)).not.toContain('just-down');
      expect(next.notes).toHaveLength(NOTES_LIMITS.maxNotes);
    });

    it('refuses when every note is still on the wall, and drops nothing', () => {
      const notes = fullOfLive();
      notes[3] = note('kept-forever', { life: 'keep', expiresAt: null });
      const data = board(...notes);
      expectRefusal(() => createNote(data, { text: 'One too many' }, NOW), 409, 'The board is full: 200 notes. Take some down first.');
      expect(data.notes).toHaveLength(NOTES_LIMITS.maxNotes);
    });

    it('drops no gone note while there is still room', () => {
      const notes = fullOfLive().slice(1);
      notes[0] = note('gone', { expiresAt: at(-HOUR) });
      const { data: next } = createNote(board(...notes), { text: 'Fits' }, NOW);
      expect(next.notes).toHaveLength(NOTES_LIMITS.maxNotes);
      expect(next.notes.map((n) => n.id)).toContain('gone');
    });

    it('checks the text before it touches a full board', () => {
      expectRefusal(() => createNote(board(...fullOfLive()), { text: '' }, NOW), 400, 'Write something first.');
    });
  });
});

describe('updateNote', () => {
  const data = board(note('a', { authorId: 'dad' }), note('b'));

  it('changes the text, trimmed, and stamps updatedAt only', () => {
    const next = updateNote(data, 'a', { text: '  Pizza tonight ' }, NOW);
    expect(next.notes[0]).toEqual({ ...data.notes[0], text: 'Pizza tonight', updatedAt: NOW.toISOString() });
    expect(next.notes[1]).toBe(data.notes[1]);
    expect(data.notes[0].text).toBe('Note a');
  });

  it('refuses an empty or overlong text', () => {
    expectRefusal(() => updateNote(data, 'a', { text: '  ' }, NOW), 400, 'Write something first.');
    expectRefusal(() => updateNote(data, 'a', { text: 'y'.repeat(501) }, NOW), 400, 'A note can be 500 characters at most.');
  });

  it('sets the author, and clears it with null or an empty string', () => {
    expect(updateNote(data, 'b', { authorId: 'mom' }, NOW).notes[1].authorId).toBe('mom');
    const cleared = updateNote(data, 'a', { authorId: null }, NOW).notes[0];
    expect('authorId' in cleared).toBe(false);
    expect('authorId' in updateNote(data, 'a', { authorId: '' }, NOW).notes[0]).toBe(false);
  });

  it('leaves the author alone when the patch does not name it', () => {
    expect(updateNote(data, 'a', { pinned: true }, NOW).notes[0].authorId).toBe('dad');
  });

  it('turns the flags on and off', () => {
    const on = updateNote(data, 'b', { pinned: true, important: true }, NOW).notes[1];
    expect(on).toMatchObject({ pinned: true, important: true });
    const off = updateNote(board(on), 'b', { pinned: false }, NOW).notes[0];
    expect(off).toMatchObject({ pinned: false, important: true });
  });

  it('refuses flags that are not on or off', () => {
    expectRefusal(() => updateNote(data, 'a', { pinned: 'on' } as unknown as NotePatch, NOW), 400, 'Pinned and important must be on or off.');
    expectRefusal(() => updateNote(data, 'a', { important: null } as unknown as NotePatch, NOW), 400, 'Pinned and important must be on or off.');
  });

  it('counts a changed life from now, not from when the note was posted', () => {
    const next = updateNote(data, 'a', { life: '3d' }, NOW).notes[0];
    expect(next.life).toBe('3d');
    expect(next.expiresAt).toBe(at(3 * DAY));
    expect(next.createdAt).toBe(data.notes[0].createdAt);
  });

  it('takes the expiry away when the life changes to keep', () => {
    const next = updateNote(data, 'a', { life: 'keep' }, NOW).notes[0];
    expect(next).toMatchObject({ life: 'keep', expiresAt: null });
  });

  it('leaves the expiry alone when the patch carries no life', () => {
    const next = updateNote(data, 'a', { text: 'Edited', pinned: true, authorId: 'mom' }, NOW).notes[0];
    expect(next.expiresAt).toBe(data.notes[0].expiresAt);
    expect(next.life).toBe('1d');
    expect(next.text).toBe('Edited');
  });

  it('restarts the clock when a live note is given the life it already has', () => {
    // Tapping "1 day" again on the phone restarts the day.
    const next = updateNote(data, 'a', { life: '1d' }, NOW).notes[0];
    expect(data.notes[0].expiresAt).toBe(at(14 * HOUR));
    expect(next.expiresAt).toBe(at(DAY));
  });

  it('brings a gone note back when it is given the same life again', () => {
    const gone = board(note('g', { life: '12h', expiresAt: at(-HOUR) }));
    expect(isGone(gone.notes[0], NOW)).toBe(true);
    const next = updateNote(gone, 'g', { life: '12h' }, NOW).notes[0];
    expect(next.expiresAt).toBe(at(12 * HOUR));
    expect(isLive(next, NOW)).toBe(true);
  });

  it('keeps a gone note gone when only its text changes', () => {
    const gone = board(note('g', { expiresAt: at(-HOUR) }));
    const next = updateNote(gone, 'g', { text: 'Fixed typo' }, NOW).notes[0];
    expect(next.expiresAt).toBe(at(-HOUR));
  });

  it('refuses a life that is not one of the presets', () => {
    expectRefusal(() => updateNote(data, 'a', { life: '2w' } as unknown as NotePatch, NOW), 400, 'Pick how long the note should stay.');
  });

  it('answers 404 for a note that is not there', () => {
    expectRefusal(() => updateNote(data, 'missing', { text: 'x' }, NOW), 404, 'That note is no longer here.');
  });
});

describe('takeDown', () => {
  it('takes a live note off the wall now', () => {
    const data = board(note('a'), note('b'));
    const next = takeDown(data, 'a', NOW);
    expect(next.notes[0]).toEqual({ ...data.notes[0], expiresAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    expect(isGone(next.notes[0], NOW)).toBe(true);
    expect(next.notes[1]).toBe(data.notes[1]);
  });

  it('takes down a kept note too, and keeps its life for a repost', () => {
    const next = takeDown(board(note('k', { life: 'keep', expiresAt: null })), 'k', NOW).notes[0];
    expect(next).toMatchObject({ life: 'keep', expiresAt: NOW.toISOString() });
  });

  it('hands back the same board when the note is already gone', () => {
    const data = board(note('g', { expiresAt: at(-HOUR) }));
    expect(takeDown(data, 'g', NOW)).toBe(data);
  });

  it('answers 404 for a note that is not there', () => {
    expectRefusal(() => takeDown(board(note('a')), 'missing', NOW), 404, 'That note is no longer here.');
  });
});

describe('repost', () => {
  it('puts a gone note back as if posted now, with the life it had', () => {
    const data = board(note('g', { life: '3d', expiresAt: at(-DAY), createdAt: at(-4 * DAY) }), note('b'));
    const next = repost(data, 'g', NOW);
    expect(next.notes[0]).toEqual({ ...data.notes[0], createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), expiresAt: at(3 * DAY) });
    expect(isLive(next.notes[0], NOW)).toBe(true);
    expect(next.notes[1]).toBe(data.notes[1]);
  });

  it('keeps a kept note without an expiry', () => {
    const taken = takeDown(board(note('k', { life: 'keep', expiresAt: null })), 'k', NOW);
    const later = new Date(NOW.getTime() + HOUR);
    const next = repost(taken, 'k', later).notes[0];
    expect(next.expiresAt).toBeNull();
    expect(next.createdAt).toBe(later.toISOString());
  });

  it('answers 404 for a note that is not there', () => {
    expectRefusal(() => repost(board(), 'missing', NOW), 404, 'That note is no longer here.');
  });
});

describe('deleteNote', () => {
  it('removes the note and keeps the rest', () => {
    const data = board(note('a'), note('b'), note('c'));
    const next = deleteNote(data, 'b');
    expect(next.notes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(next.notes[0]).toBe(data.notes[0]);
    expect(data.notes).toHaveLength(3);
  });

  it('answers 404 for a note that is not there', () => {
    expectRefusal(() => deleteNote(board(note('a')), 'missing'), 404, 'That note is no longer here.');
  });
});
