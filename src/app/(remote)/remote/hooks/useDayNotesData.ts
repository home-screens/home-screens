'use client';

import { useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { refusalText, type JsonWriteRequest } from '@/lib/hub-request';
import { useWriteSession } from '@/hooks/useWriteSession';
import { tempId } from '@/lib/write-session';
import {
  addDayNoteRequest, loadDayNotes, removeDayNoteRequest, sendDayNotesWrite, updateDayNoteRequest,
} from '@/lib/day-notes-client';
import { DayNotesError, addDayNote, removeDayNote, updateDayNote } from '@/lib/day-notes';
import type { DayNote, DayNotesData } from '@/types/day-notes';
import { showToast } from '../remote-toast';

const POLL_MS = FETCH_KEY_REGISTRY['day-notes'].ttlMs;
const EMPTY: DayNotesData = { notes: [] };

const tolerated = (e: unknown) => e instanceof DayNotesError;

async function load(): Promise<DayNotesData | null> {
  const notes = await loadDayNotes(editorFetch);
  return notes ? { notes } : null;
}

/**
 * Data and actions behind the Notes tab's Calendar page: every kept day
 * note, polled while the page is in view. Each write's local change is the
 * store's own rule, shown at once and replayed over newer answers until its
 * request lands (`useWriteSession`); a change the rules refuse on what the
 * phone shows now (a full day, say) is not sent and its code goes to the
 * toast at once, phrased from `refusals.dayNotes` like the hub's own.
 */
export function useDayNotesData() {
  const t = useTranslate('remote');

  const { data, loaded, loadError, retry, write, mapId, resolveId } = useWriteSession<DayNotesData, JsonWriteRequest, DayNote>({
    initial: EMPTY,
    load,
    send: async (request) => {
      const { notes, created } = await sendDayNotesWrite(editorFetch, request, t('notes.dayNotes.saveError'));
      return { data: { notes }, created };
    },
    pollMs: POLL_MS,
    tolerates: tolerated,
    onRefused: (e) => showToast(refusalText(e, t, 'notes.dayNotes.saveError', 'hubRequest.saveFailed'), 'error'),
  });

  /** Write a new note for `date` (`today` is the household's day). Resolves to whether it was saved. */
  const add = useCallback((date: string, text: string, today: string): Promise<boolean> => {
    const temp = tempId();
    return write(
      (notes) => addDayNote(notes, { id: temp, date, text }, today),
      () => addDayNoteRequest(date, text),
      (created) => { if (created) mapId(temp, created.id); },
    ).then((saved) => saved !== null);
  }, [write, mapId]);

  /** Change a note's words; empty words remove it, as on the hub. */
  const update = useCallback((id: string, text: string, today: string): Promise<boolean> => write(
    (notes, r) => updateDayNote(notes, r(id), text, today),
    (r) => updateDayNoteRequest(r(id), text),
  ).then((saved) => saved !== null), [write]);

  const remove = useCallback((id: string): Promise<boolean> => write(
    (notes, r) => removeDayNote(notes, r(id)),
    (r) => removeDayNoteRequest(r(id)),
  ).then((saved) => saved !== null), [write]);

  // resolveId answers the hub's id for a note added from here once the hub
  // has named it, and any other id as it is.
  return { notes: data.notes, loaded, loadError, retry, add, update, remove, resolveId };
}
