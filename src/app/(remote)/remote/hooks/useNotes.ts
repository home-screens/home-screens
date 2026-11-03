'use client';

import { useCallback, useEffect, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { HubUnreachableError, refusalText } from '@/lib/hub-request';
import { useTranslate } from '@/i18n';
import { useWriteSession } from '@/hooks/useWriteSession';
import { sameId, tempId } from '@/lib/write-session';
import {
  createNote,
  deleteNote,
  repost as repostNote,
  takeDown as takeDownNote,
  updateNote,
  type CreateNoteInput,
  type NotePatch,
} from '@/lib/notes-actions';
import { NotesError } from '@/lib/notes-errors';
import {
  NOTES_TTL_MS,
  allNotesUrl,
  createNoteRequest,
  deleteNoteRequest,
  noteActionRequest,
  sendNotesWrite,
  updateNoteRequest,
  type NotesWriteRequest,
} from '@/lib/notes-client';
import type { Note } from '@/types/notes';
import { showToast } from '../remote-toast';

const NOTES_POLL_MS = NOTES_TTL_MS;
/** How often ages and time left move on when nothing else changed. */
const CLOCK_TICK_MS = 30_000;

const tolerated = (e: unknown) => e instanceof NotesError;

async function loadNotes(): Promise<Note[] | null> {
  const res = await editorFetch(allNotesUrl());
  if (!res.ok) return null;
  const json = (await res.json()) as { notes?: Note[] };
  return Array.isArray(json.notes) ? json.notes : [];
}

/**
 * Data and actions behind the /remote Notes tab: every note on the board,
 * live and gone, polled while the tab is in view.
 *
 * Each write's local change is the store's own action from
 * `lib/notes-actions.ts`, so what the phone shows before the answer is what
 * the store will hold after it (`useWriteSession` shows it at once and
 * replays it over newer answers). A change the rules refuse on what the
 * phone shows now (a blank note, a board full of live notes) is not sent:
 * its code goes straight to the toast, phrased the way the hub's own refusal
 * is (`refusals.notes` in the `core` dictionary, shared with the editor).
 *
 * `now` lives here rather than in the tab: it is stamped with every change,
 * so a note taken down leaves the live list at once instead of on the next
 * clock tick, and it ticks on its own so ages and time left keep moving.
 */
export function useNotes() {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [now, setNow] = useState(() => new Date());

  const { data: notes, loaded, loadError, retry, write, mapId, resolveId } = useWriteSession<Note[], NotesWriteRequest, Note>({
    initial: [],
    load: loadNotes,
    send: async (request) => {
      const { notes, created } = await sendNotesWrite(editorFetch, request, t('notes.saveError'));
      return { data: notes, created };
    },
    pollMs: NOTES_POLL_MS,
    tolerates: tolerated,
    onRefused: (e) => showToast(
      e instanceof HubUnreachableError ? t('hubRequest.saveFailed') : refusalText(e, tCore, 'refusals.notes.failed'),
      'error',
    ),
  });

  useEffect(() => {
    setNow(new Date());
  }, [notes]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  /**
   * Resolves to whether the note was saved, so the write bar can hand back
   * text that was not. The optimistic note is the store's own `createNote`
   * result under a temp id, pointed at the server's id when the answer names it.
   */
  const post = useCallback(
    (input: CreateNoteInput): Promise<boolean> => {
      const temp = tempId();
      const at = new Date();
      return write(
        (ns) => {
          const { data, note } = createNote({ notes: ns }, input, at);
          return data.notes.map((n) => (n === note ? { ...note, id: temp } : n));
        },
        () => createNoteRequest(input),
        (created) => {
          if (created) mapId(temp, created.id);
        },
      ).then((saved) => saved !== null);
    },
    [write, mapId],
  );

  const update = useCallback(
    (id: string, patch: NotePatch) => {
      const at = new Date();
      void write(
        (ns, r) => updateNote({ notes: ns }, r(id), patch, at).notes,
        (r) => updateNoteRequest(r(id), patch),
      );
    },
    [write],
  );

  const takeDown = useCallback(
    (id: string) => {
      const at = new Date();
      void write(
        (ns, r) => takeDownNote({ notes: ns }, r(id), at).notes,
        (r) => noteActionRequest(r(id), 'take-down'),
      );
    },
    [write],
  );

  const repost = useCallback(
    (id: string) => {
      const at = new Date();
      void write(
        (ns, r) => repostNote({ notes: ns }, r(id), at).notes,
        (r) => noteActionRequest(r(id), 'repost'),
      );
    },
    [write],
  );

  const remove = useCallback(
    (id: string) => {
      void write(
        (ns, r) => deleteNote({ notes: ns }, r(id)).notes,
        (r) => deleteNoteRequest(r(id)),
      );
    },
    [write],
  );

  /** The note an open sheet was opened on, still found after its temp id was swapped for the real one. */
  const findNote = useCallback(
    (id: string): Note | null => notes.find((n) => sameId(n.id, id, resolveId)) ?? null,
    [notes, resolveId],
  );

  return {
    notes,
    now,
    loaded,
    loadError,
    retry,
    findNote,
    post,
    update,
    takeDown,
    repost,
    remove,
  };
}
