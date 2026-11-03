import { NextResponse } from 'next/server';
import { updateDayNotesData } from './day-notes-data';
import type { DayNote, DayNotesData } from '@/types/day-notes';

/**
 * Run one write against the day notes and answer with every kept note, so
 * the phone reconciles against server truth in one step. A `DayNotesError`
 * reaches the route wrapper, which answers with its code.
 */
export async function dayNotesWrite(
  mutate: (data: DayNotesData, today: string) => DayNotesData,
  extra?: () => { created?: DayNote },
): Promise<NextResponse> {
  const data = await updateDayNotesData(mutate);
  return NextResponse.json({ notes: data.notes, ...(extra ? extra() : {}) });
}
