/**
 * Calendar day notes, stored in `data/day-notes.json` (see `lib/day-notes-data.ts`).
 *
 * Short lines of the family's own words for a day ("Picture day", "Bring
 * boots"), typed on the phone and drawn on that day in every calendar on the
 * wall, above the day's events. Household data like the notes board: no
 * calendar account owns them and no family member is named, so a calendar
 * showing one person's events still shows every day note.
 */
export interface DayNote {
  id: string;
  /** The household's calendar day, `YYYY-MM-DD`. */
  date: string;
  /** One line of plain words, tidied, at most `DAY_NOTES_LIMITS.maxTextLength` characters. */
  text: string;
}

export interface DayNotesData {
  /** Every kept note, in the order they were written; a day's notes draw in this order. */
  notes: DayNote[];
}

export const DAY_NOTES_LIMITS = {
  /** Characters per note, counted as people see them (an emoji is one). */
  maxTextLength: 60,
  /** Notes on one day: enough for "Picture day", "Library books" and a snack. */
  maxPerDay: 3,
  /**
   * Days a note is kept after its day before the next write tidies it away:
   * the furthest back any calendar view looks (a month grid's first row).
   */
  keepDays: 42,
  /** How far ahead a note can be written. */
  aheadDays: 366,
  /** Notes in the file, a backstop far above three a day for `keepDays + aheadDays`. */
  maxNotes: 1500,
} as const;
