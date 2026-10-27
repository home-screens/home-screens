import { describe, expect, it } from 'vitest';
import { NOTES_STATE_KEYS, NOTES_STATE_KEY_LIST, deriveNotesState, notesProvidedStateKeys } from '../notes-state';
import type { Note } from '@/types/notes';

const NOW = new Date('2026-10-20T15:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    text: `Note ${id}`,
    pinned: false,
    important: false,
    life: '1d',
    createdAt: at(-60_000),
    updatedAt: at(-60_000),
    expiresAt: at(3_600_000),
    ...overrides,
  };
}

describe('deriveNotesState', () => {
  it('counts the live notes, the important ones and the pinned ones', () => {
    const notes = [
      note('plain'),
      note('imp', { important: true }),
      note('pin', { pinned: true, expiresAt: null }),
      note('both', { pinned: true, important: true }),
      note('gone-imp', { important: true, pinned: true, expiresAt: at(-1) }),
      note('gone-now', { expiresAt: at(0) }),
    ];
    expect(deriveNotesState(notes, NOW)).toEqual({ 'notes.count': 4, 'notes.important': 2, 'notes.pinned': 2 });
  });

  it('publishes zeros for an empty board, never nothing', () => {
    expect(deriveNotesState([], NOW)).toEqual({ 'notes.count': 0, 'notes.important': 0, 'notes.pinned': 0 });
  });

  it('drops a note from the counts the moment it expires', () => {
    const notes = [note('soon', { important: true, expiresAt: at(1000) })];
    expect(deriveNotesState(notes, NOW)['notes.important']).toBe(1);
    expect(deriveNotesState(notes, new Date(NOW.getTime() + 1000))['notes.important']).toBe(0);
  });
});

describe('notesProvidedStateKeys', () => {
  it('offers every key the board publishes, labelled through the dictionary', () => {
    const keys = notesProvidedStateKeys((key) => `t:${key}`);
    expect(keys.map((k) => k.key)).toEqual(NOTES_STATE_KEY_LIST);
    expect(keys).toEqual([
      { key: 'notes.count', label: 't:stateKeys.notes.count', sampleValues: ['3'] },
      { key: 'notes.important', label: 't:stateKeys.notes.important', sampleValues: ['1'] },
      { key: 'notes.pinned', label: 't:stateKeys.notes.pinned', sampleValues: ['1'] },
    ]);
  });

  it('names exactly the keys deriveNotesState publishes', () => {
    expect(Object.keys(deriveNotesState([], NOW)).sort()).toEqual([...NOTES_STATE_KEY_LIST].sort());
    expect(NOTES_STATE_KEY_LIST).toEqual(Object.values(NOTES_STATE_KEYS));
  });
});
