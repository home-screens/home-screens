import { describe, expect, it } from 'vitest';
import { fitKeyOf } from '../shared';
import type { Note } from '@/types/notes';

function note(id: string, text: string, updatedAt = '2026-10-26T15:00:00.000Z'): Note {
  return { id, text, pinned: false, important: false, life: '1d', createdAt: updatedAt, updatedAt, expiresAt: null };
}

describe('fitKeyOf', () => {
  it('changes when the wording changes, even at the same length', () => {
    // A space swapped for a line break wraps differently and must re-measure.
    const a = fitKeyOf([note('n', 'Pizza night is Thursday')]);
    const b = fitKeyOf([note('n', 'Pizza night is\nThursday')]);
    expect(a).not.toBe(b);
  });

  it('is stable for the same notes and settings, and moves with a setting', () => {
    const notes = [note('a', 'One'), note('b', 'Two')];
    expect(fitKeyOf(notes, 24, true)).toBe(fitKeyOf(notes, 24, true));
    expect(fitKeyOf(notes, 24, true)).not.toBe(fitKeyOf(notes, 25, true));
  });
});
