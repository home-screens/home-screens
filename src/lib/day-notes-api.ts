import { NextResponse } from 'next/server';
import { DayNotesError } from './day-notes';
import { updateDayNotesData } from './day-notes-data';
import type { DayNote, DayNotesData } from '@/types/day-notes';

/**
 * Run one write against the day notes and answer with every kept note, so
 * the phone reconciles against server truth in one step. A `DayNotesError`
 * becomes its JSON error; anything else reaches the route wrapper.
 */
export async function dayNotesWrite(
  mutate: (data: DayNotesData, today: string) => DayNotesData,
  extra?: () => { created?: DayNote },
): Promise<NextResponse> {
  try {
    const data = await updateDayNotesData(mutate);
    return NextResponse.json({ notes: data.notes, ...(extra ? extra() : {}) });
  } catch (err) {
    if (err instanceof DayNotesError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
