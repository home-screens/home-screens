import { describe, expect, it } from 'vitest';
import { addDayNoteRequest, loadDayNotes, sendDayNotesWrite } from '../day-notes-client';
import { sendNotesWrite, createNoteRequest } from '../notes-client';

const answer = (body: string, status = 200) => async () => new Response(body, { status });

// An answer the phone cannot use must never read as an empty calendar or
// board: that cleared what the family had written.
describe('an answer without notes', () => {
  it('is a failed load, not an empty calendar', async () => {
    expect(await loadDayNotes(answer('{}'))).toBeNull();
    expect(await loadDayNotes(answer(''))).toBeNull();
    expect(await loadDayNotes(answer('{"notes":[]}'))).toEqual([]);
  });

  it('is a failed day-note write, not a saved one', async () => {
    await expect(sendDayNotesWrite(answer(''), addDayNoteRequest('2026-11-03', 'Elternabend'), 'Not saved')).rejects.toThrow('Not saved');
  });

  it('is a failed board write, not a saved one', async () => {
    await expect(sendNotesWrite(answer('{}'), createNoteRequest({ text: 'Milk' } as never), 'Not saved')).rejects.toThrow('Not saved');
  });
});
