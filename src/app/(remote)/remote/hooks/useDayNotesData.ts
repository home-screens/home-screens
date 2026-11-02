'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { requestFailureText, type JsonWriteRequest } from '@/lib/hub-request';
import {
  addDayNoteRequest, loadDayNotes, removeDayNoteRequest, sendDayNotesWrite, updateDayNoteRequest,
} from '@/lib/day-notes-client';
import { DayNotesError, addDayNote, removeDayNote, updateDayNote } from '@/lib/day-notes';
import type { DayNote, DayNotesData } from '@/types/day-notes';
import { showToast } from '../remote-toast';

const POLL_MS = FETCH_KEY_REGISTRY['day-notes'].ttlMs;
const TEMP_PREFIX = 'tmp-';

type ResolveId = (id: string) => string;
/** A local change replayed over server truth until its request lands; the store's own rule. */
type Change = (data: DayNotesData, resolveId: ResolveId) => DayNotesData;

function replay(pending: ReadonlyArray<{ apply: Change }>, server: DayNotesData, resolveId: ResolveId): DayNotesData {
  return pending.reduce((data, p) => {
    try {
      return p.apply(data, resolveId);
    } catch (e) {
      if (e instanceof DayNotesError) return data;
      throw e;
    }
  }, server);
}

function tempId(): string {
  return `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Data and actions behind the Notes tab's Calendar page: every kept day
 * note, polled while the page is open. The notes board's write machinery in
 * miniature: writes go out one at a time in the order they were asked for,
 * each one's local change (the store's own rule) shows at once and is
 * replayed over the newest server answer until its request lands, a new
 * note's temp id is pointed at the server's id as soon as the answer names
 * it, polls wait one period after a write, and a refused write drops its
 * change, shows the server's words and refetches.
 */
export function useDayNotesData() {
  const t = useTranslate('remote');
  const [notes, setNotes] = useState<DayNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const serverRef = useRef<DayNotesData>({ notes: [] });
  const pendingRef = useRef<Array<{ apply: Change }>>([]);
  const idMapRef = useRef(new Map<string, string>());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const holdUntilRef = useRef(0);
  const inFlightRef = useRef(0);

  const resolveId = useCallback<ResolveId>((id) => idMapRef.current.get(id) ?? id, []);

  const render = useCallback(() => {
    setNotes(replay(pendingRef.current, serverRef.current, resolveId).notes);
  }, [resolveId]);

  const refresh = useCallback(async (force = false) => {
    try {
      const loaded = await loadDayNotes(editorFetch);
      if (!loaded) {
        setLoadError(true);
        return;
      }
      if (!force && (Date.now() < holdUntilRef.current || inFlightRef.current > 0)) return;
      serverRef.current = { notes: loaded };
      render();
      setLoaded(true);
      setLoadError(false);
    } catch (e) {
      if (isSessionExpired(e)) return;
      setLoadError(true);
    }
  }, [render]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  /**
   * Queue one write. Resolves to whether it was saved. A change the rules
   * refuse on what the phone shows now (a full day, say) is not sent: its
   * words go to the toast at once.
   */
  const write = useCallback(
    (apply: Change, request: (resolveId: ResolveId) => JsonWriteRequest, onCreated?: (created: DayNote) => void): Promise<boolean> => {
      try {
        apply(replay(pendingRef.current, serverRef.current, resolveId), resolveId);
      } catch (e) {
        if (!(e instanceof DayNotesError)) throw e;
        showToast(e.message, 'error');
        return Promise.resolve(false);
      }
      const entry = { apply };
      pendingRef.current.push(entry);
      render();
      inFlightRef.current += 1;

      const run = async (): Promise<boolean> => {
        try {
          const { notes: next, created } = await sendDayNotesWrite(editorFetch, request(resolveId), t('notes.dayNotes.saveError'));
          holdUntilRef.current = Date.now() + POLL_MS;
          serverRef.current = { notes: next };
          pendingRef.current = pendingRef.current.filter((p) => p !== entry);
          if (created) onCreated?.(created);
          render();
          return true;
        } catch (e) {
          pendingRef.current = pendingRef.current.filter((p) => p !== entry);
          if (isSessionExpired(e)) return false;
          render();
          showToast(requestFailureText(e, { unreachable: t('hubRequest.saveFailed'), fallback: t('notes.dayNotes.saveError') }), 'error');
          void refresh(true);
          return false;
        } finally {
          inFlightRef.current -= 1;
        }
      };
      const result = queueRef.current.then(run, run);
      queueRef.current = result;
      return result;
    },
    [render, resolveId, refresh, t],
  );

  /** Write a new note for `date` (`today` is the household's day). */
  const add = useCallback((date: string, text: string, today: string): Promise<boolean> => {
    const temp = tempId();
    return write(
      (data) => addDayNote(data, { id: temp, date, text }, today),
      () => addDayNoteRequest(date, text),
      (created) => idMapRef.current.set(temp, created.id),
    );
  }, [write]);

  /** Change a note's words; empty words remove it, as on the hub. */
  const update = useCallback((id: string, text: string, today: string): Promise<boolean> => write(
    (data, r) => updateDayNote(data, r(id), text, today),
    (r) => updateDayNoteRequest(r(id), text),
  ), [write]);

  const remove = useCallback((id: string): Promise<boolean> => write(
    (data, r) => removeDayNote(data, r(id)),
    (r) => removeDayNoteRequest(r(id)),
  ), [write]);

  // resolveId answers the hub's id for a note added from here once the hub
  // has named it, and any other id as it is.
  return { notes, loaded, loadError, retry: () => refresh(true), add, update, remove, resolveId };
}
