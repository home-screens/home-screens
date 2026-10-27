'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
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
const TEMP_PREFIX = 'tmp-';

type ResolveId = (id: string) => string;
/**
 * A local change replayed over server truth until its request lands. Each
 * one runs the store's own action from `lib/notes-actions.ts`, so what the
 * phone shows before the answer is what the store will hold after it.
 */
type Mutation = (notes: Note[], resolveId: ResolveId) => Note[];

function tempId(): string {
  return `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameId(candidate: string, wanted: string, resolveId: ResolveId): boolean {
  return candidate === wanted || candidate === resolveId(wanted);
}

/**
 * Server truth with every pending change on top. A change the newer truth no
 * longer allows (another phone deleted the note) is skipped rather than
 * thrown; its own request answers for it.
 */
function replay(pending: ReadonlyArray<{ apply: Mutation }>, server: Note[], resolveId: ResolveId): Note[] {
  return pending.reduce((ns, p) => {
    try {
      return p.apply(ns, resolveId);
    } catch (e) {
      if (e instanceof NotesError) return ns;
      throw e;
    }
  }, server);
}

/**
 * Data and actions behind the /remote Notes tab: every note on the board,
 * live and gone, polled while the tab is mounted.
 *
 * The same write machinery as the Lists tab: writes go out one at a time in
 * the order they were asked for, each one's local change (the store's own
 * action) is replayed over the newest server answer until its request
 * lands, a posted note's temp id is pointed at the server's id as soon as
 * the answer names it, and polls are held off for one period after a write.
 * A failed write drops its change, shows the server's message (a refused
 * author included) and refetches.
 *
 * `now` lives here rather than in the tab: it is stamped with every change,
 * so a note taken down leaves the live list at once instead of on the next
 * clock tick, and it ticks on its own so ages and time left keep moving.
 */
export function useNotes() {
  const t = useTranslate('remote');
  const [notes, setNotes] = useState<Note[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const serverRef = useRef<Note[]>([]);
  const pendingRef = useRef<Array<{ apply: Mutation }>>([]);
  const idMapRef = useRef(new Map<string, string>());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const holdUntilRef = useRef(0);
  const inFlightRef = useRef(0);

  const resolveId = useCallback<ResolveId>((id) => idMapRef.current.get(id) ?? id, []);

  const render = useCallback(() => {
    setNotes(replay(pendingRef.current, serverRef.current, resolveId));
    setNow(new Date());
  }, [resolveId]);

  const refresh = useCallback(async (force = false) => {
    try {
      const res = await editorFetch(allNotesUrl());
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const json = (await res.json()) as { notes?: Note[] };
      if (!force && (Date.now() < holdUntilRef.current || inFlightRef.current > 0)) return;
      serverRef.current = Array.isArray(json.notes) ? json.notes : [];
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
    const id = setInterval(() => void refresh(), NOTES_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  /**
   * Queue one write. `apply` shows the change at once; `request` is built
   * when the write's turn comes, with ids resolved; `onSuccess` sees the
   * note the server made, when it made one. A change the rules refuse on
   * what the phone shows now (a blank note, a board full of live notes) is
   * not sent: its message goes straight to the toast and this answers null.
   */
  const write = useCallback(
    (
      apply: Mutation,
      request: (resolveId: ResolveId) => NotesWriteRequest,
      onSuccess?: (created?: Note) => void,
    ): Promise<Note[] | null> => {
      try {
        apply(replay(pendingRef.current, serverRef.current, resolveId), resolveId);
      } catch (e) {
        if (!(e instanceof NotesError)) throw e;
        showToast(e.message, 'error');
        return Promise.resolve(null);
      }
      const entry = { apply };
      pendingRef.current.push(entry);
      render();
      inFlightRef.current += 1;

      const run = async (): Promise<Note[] | null> => {
        try {
          const { notes: next, created } = await sendNotesWrite(editorFetch, request(resolveId), t('notes.saveError'));
          holdUntilRef.current = Date.now() + NOTES_POLL_MS;
          serverRef.current = next;
          pendingRef.current = pendingRef.current.filter((p) => p !== entry);
          onSuccess?.(created);
          render();
          return next;
        } catch (e) {
          pendingRef.current = pendingRef.current.filter((p) => p !== entry);
          if (isSessionExpired(e)) return null;
          render();
          showToast(e instanceof Error ? e.message : t('notes.saveError'), 'error');
          void refresh(true);
          return null;
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
          if (created) idMapRef.current.set(temp, created.id);
        },
      ).then((saved) => saved !== null);
    },
    [write],
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
    retry: () => refresh(true),
    findNote,
    post,
    update,
    takeDown,
    repost,
    remove,
  };
}

export type NotesApi = ReturnType<typeof useNotes>;
