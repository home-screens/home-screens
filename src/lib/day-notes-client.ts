import { dayNotesUrl } from './fetch-keys';
import { readJson, sendJsonWrite, type HubFetch, type JsonWriteRequest } from './hub-request';
import type { DayNote } from '@/types/day-notes';

/**
 * Requests against the calendar's day notes, so the shape of a route lives in
 * one place and the phone's Calendar page keeps only its write machinery.
 */

export function addDayNoteRequest(date: string, text: string): JsonWriteRequest {
  return { url: dayNotesUrl(), method: 'POST', body: { date, text } };
}

export function updateDayNoteRequest(id: string, text: string): JsonWriteRequest {
  return { url: `${dayNotesUrl()}/${encodeURIComponent(id)}`, method: 'PATCH', body: { text } };
}

export function removeDayNoteRequest(id: string): JsonWriteRequest {
  return { url: `${dayNotesUrl()}/${encodeURIComponent(id)}`, method: 'DELETE' };
}

/**
 * Every kept day note, or `null` when the hub refused or answered without
 * notes: an answer the phone cannot use is a failed load, never an empty
 * calendar.
 */
export async function loadDayNotes(fetcher: HubFetch): Promise<DayNote[] | null> {
  const res = await fetcher(dayNotesUrl());
  if (!res.ok) return null;
  const json = (await readJson(res)) as { notes?: unknown } | null;
  return Array.isArray(json?.notes) ? (json.notes as DayNote[]) : null;
}

export interface DayNotesWriteResult {
  notes: DayNote[];
  created?: DayNote;
}

/**
 * Send one write and hand back every note. A refusal throws the hub's own
 * words ("A day holds 3 notes"), else `fallback`, and so does an answer
 * without notes, so it is never taken for an empty calendar; a hub out of
 * reach and an expired session come through as themselves.
 */
export async function sendDayNotesWrite(fetcher: HubFetch, request: JsonWriteRequest, fallback: string): Promise<DayNotesWriteResult> {
  const json = (await sendJsonWrite(fetcher, request, fallback)) as Partial<DayNotesWriteResult> | null;
  if (!Array.isArray(json?.notes)) throw new Error(fallback);
  return { notes: json.notes, created: json.created };
}
