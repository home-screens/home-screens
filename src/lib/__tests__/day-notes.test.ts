import { describe, expect, it } from 'vitest';
import {
  DayNotesError, NO_DAY_NOTES, LAST_DAY_NOTES_PAGE, addDayNote, addIsoDays, clampDayNoteText, dayNoteLength, dayNotesFor,
  hasDayNoteIn, indexDayNotes, isIsoDate, normalizeDayNoteText, notesOnDay, removeDayNote, sweepDayNotes, updateDayNote,
  upcomingDays, validateDayNotesData,
} from '../day-notes';
import { DAY_NOTES_LIMITS, type DayNote, type DayNotesData } from '@/types/day-notes';

const TODAY = '2026-11-02';
const note = (id: string, date: string, text = `Note ${id}`): DayNote => ({ id, date, text });
const data = (...notes: DayNote[]): DayNotesData => ({ notes });

function refused(fn: () => unknown, status: number): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DayNotesError);
    expect((e as DayNotesError).status).toBe(status);
    return (e as Error).message;
  }
  throw new Error('expected a refusal');
}

describe('dates', () => {
  it('takes real calendar days only', () => {
    expect(isIsoDate('2026-11-02')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-11-2')).toBe(false);
    expect(isIsoDate(20261102)).toBe(false);
  });
  it('counts calendar days across months, years and the daylight-saving change', () => {
    expect(addIsoDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addIsoDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addIsoDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('words', () => {
  it('makes one tidy line', () => {
    expect(normalizeDayNoteText('  Picture   day\n bring\tboots  ')).toBe('Picture day bring boots');
  });
  it('counts characters as people see them: an emoji is one', () => {
    expect(dayNoteLength('Costume party \u{1F383}')).toBe(15);
    expect('Costume party \u{1F383}'.length).toBe(16);
  });
  it('cuts to the cap by that count, never through an emoji', () => {
    const long = '\u{1F383}'.repeat(DAY_NOTES_LIMITS.maxTextLength + 5);
    expect(dayNoteLength(clampDayNoteText(long))).toBe(DAY_NOTES_LIMITS.maxTextLength);
    expect(clampDayNoteText('short')).toBe('short');
  });
});

describe('addDayNote', () => {
  it('writes a tidied note for today or a later day, after the ones already there', () => {
    const next = addDayNote(data(note('a', '2026-11-04', 'Picture day')), { id: 'b', date: '2026-11-04', text: ' Library  books ' }, TODAY);
    expect(notesOnDay(next, '2026-11-04').map((n) => n.text)).toEqual(['Picture day', 'Library books']);
  });

  it('takes up to three notes on a day, then refuses', () => {
    let d = data();
    for (const id of ['a', 'b', 'c']) d = addDayNote(d, { id, date: TODAY, text: id }, TODAY);
    expect(refused(() => addDayNote(d, { id: 'd', date: TODAY, text: 'd' }, TODAY), 409)).toMatch(/3 notes/);
    expect(addDayNote(d, { id: 'd', date: addIsoDays(TODAY, 1), text: 'd' }, TODAY).notes).toHaveLength(4);
  });

  it('counts an emoji as one against the cap', () => {
    const words = `${'a'.repeat(DAY_NOTES_LIMITS.maxTextLength - 1)}\u{1F383}`;
    expect(addDayNote(data(), { id: 'a', date: TODAY, text: words }, TODAY).notes[0].text).toBe(words);
    refused(() => addDayNote(data(), { id: 'a', date: TODAY, text: `${words}x` }, TODAY), 400);
  });

  it('refuses a day that is over, more than a year out, or not a day, and empty or missing words', () => {
    expect(refused(() => addDayNote(data(), { id: 'a', date: '2026-11-01', text: 'Late' }, TODAY), 400)).toMatch(/over/);
    const last = addIsoDays(TODAY, DAY_NOTES_LIMITS.aheadDays);
    expect(addDayNote(data(), { id: 'a', date: last, text: 'Far' }, TODAY).notes).toHaveLength(1);
    expect(refused(() => addDayNote(data(), { id: 'a', date: addIsoDays(last, 1), text: 'Far' }, TODAY), 400)).toMatch(/too far/);
    refused(() => addDayNote(data(), { id: 'a', date: '2026-02-30', text: 'x' }, TODAY), 400);
    refused(() => addDayNote(data(), { id: 'a', date: TODAY, text: '   ' }, TODAY), 400);
    refused(() => addDayNote(data(), { id: 'a', date: TODAY, text: 7 }, TODAY), 400);
  });

  it('refuses an id already used, and a full store', () => {
    refused(() => addDayNote(data(note('a', TODAY)), { id: 'a', date: TODAY, text: 'x' }, TODAY), 409);
    const many = Array.from({ length: DAY_NOTES_LIMITS.maxNotes }, (_, i) => note(`n${i}`, addIsoDays(TODAY, Math.floor(i / 3))));
    refused(() => addDayNote(data(...many), { id: 'z', date: addIsoDays(TODAY, 1), text: 'x' }, TODAY), 409);
  });
});

describe('updateDayNote', () => {
  it('changes one note and leaves the others alone', () => {
    const d = data(note('a', TODAY, 'Picture day'), note('b', TODAY, 'Library books'));
    expect(updateDayNote(d, 'a', 'Picture day, wear blue', TODAY).notes.map((n) => n.text)).toEqual(['Picture day, wear blue', 'Library books']);
  });
  it('removes the note when its words are emptied, and hands back the same object when nothing changes', () => {
    const d = data(note('a', TODAY, 'Picture day'));
    expect(updateDayNote(d, 'a', '  ', TODAY).notes).toEqual([]);
    expect(updateDayNote(d, 'a', ' Picture  day ', TODAY)).toBe(d);
  });
  it('refuses a note that is gone, and changing one on a day that is over', () => {
    refused(() => updateDayNote(data(), 'a', 'x', TODAY), 404);
    refused(() => updateDayNote(data(note('a', '2026-10-30')), 'a', 'x', TODAY), 400);
    expect(updateDayNote(data(note('a', '2026-10-30')), 'a', '', TODAY).notes).toEqual([]);
  });
});

describe('removeDayNote', () => {
  it('removes one note, and changes nothing for one already gone', () => {
    const d = data(note('a', TODAY), note('b', TODAY));
    expect(removeDayNote(d, 'a').notes.map((n) => n.id)).toEqual(['b']);
    expect(removeDayNote(d, 'zzz')).toBe(d);
  });
});

describe('sweepDayNotes', () => {
  it('drops notes more than keepDays before today and keeps the rest', () => {
    const keepFrom = addIsoDays(TODAY, -DAY_NOTES_LIMITS.keepDays);
    const d = data(note('old', addIsoDays(keepFrom, -1)), note('kept', keepFrom), note('today', TODAY));
    expect(sweepDayNotes(d, TODAY).notes.map((n) => n.id)).toEqual(['kept', 'today']);
    const fresh = data(note('today', TODAY));
    expect(sweepDayNotes(fresh, TODAY)).toBe(fresh);
  });
});

describe('the view index', () => {
  const index = indexDayNotes([note('a', '2026-11-04', 'Picture day'), note('b', '2026-11-05', 'Pajama day'), note('c', '2026-11-04', 'Library books')]);
  it('lists each day\'s words in the order they were written', () => {
    expect(dayNotesFor(index, new Date(2026, 10, 4, 23, 59))).toEqual(['Picture day', 'Library books']);
    expect(dayNotesFor(index, new Date(2026, 10, 6))).toEqual([]);
    expect(dayNotesFor(undefined, new Date(2026, 10, 4))).toEqual([]);
  });
  it('says whether any day in view has a note', () => {
    expect(hasDayNoteIn(index, [new Date(2026, 10, 3), new Date(2026, 10, 4)])).toBe(true);
    expect(hasDayNoteIn(index, [new Date(2026, 10, 6)])).toBe(false);
    expect(hasDayNoteIn(NO_DAY_NOTES, [new Date(2026, 10, 4)])).toBe(false);
    expect(indexDayNotes([])).toBe(NO_DAY_NOTES);
  });
});

describe('validateDayNotesData', () => {
  it('accepts a sound document, past days included', () => {
    expect(validateDayNotesData(data())).toBeNull();
    expect(validateDayNotesData(data(note('a', '2020-01-01', 'Old'), note('b', TODAY)))).toBeNull();
  });
  it('names what is wrong', () => {
    expect(validateDayNotesData(null)).toMatch(/notes list/);
    expect(validateDayNotesData({ notes: {} })).toMatch(/notes list/);
    expect(validateDayNotesData(data(note('a', 'tomorrow')))).toMatch(/not a day/);
    expect(validateDayNotesData(data(note('a', TODAY, '  ')))).toMatch(/no words/);
    expect(validateDayNotesData(data(note('a', TODAY), note('a', TODAY)))).toMatch(/repeats/);
    expect(validateDayNotesData(data(note('a', TODAY, 'a'.repeat(DAY_NOTES_LIMITS.maxTextLength + 1))))).toMatch(/longer/);
    expect(validateDayNotesData(data(note('a', TODAY), note('b', TODAY), note('c', TODAY), note('d', TODAY)))).toMatch(/more than 3/);
  });
});

describe('upcomingDays', () => {
  it('lists seven days from today, then seven days a page', () => {
    expect(upcomingDays(TODAY, 0)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(upcomingDays(TODAY, 1)[0]).toBe('2026-11-09');
  });
  it('can reach the last day a note may be written for, and lists nothing past it', () => {
    const lastPage = upcomingDays(TODAY, LAST_DAY_NOTES_PAGE);
    expect(lastPage[lastPage.length - 1]).toBe(addIsoDays(TODAY, DAY_NOTES_LIMITS.aheadDays));
    for (const day of lastPage) expect(addDayNote(data(), { id: 'x', date: day, text: 'Far off' }, TODAY).notes).toHaveLength(1);
  });
});
