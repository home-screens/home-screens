'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { ChoreSession, type ChoreSnapshot } from '@/lib/chore-client';
import { requestFailureText } from '@/lib/hub-request';
import type { ChoreDefinition } from '@/types/config';

/** How often a chore save that failed is sent again. */
export const CHORE_SAVE_RETRY_MS = 10_000;

/** What a surface does with the autosave's answers; it keeps its own state and its own words. */
export interface ChoreAutosaveSurface {
  /** Show a list the hub handed over: the load, a reload, or after a conflict, the other surface's copy. */
  show: (snapshot: ChoreSnapshot) => void;
  /** Somebody else saved first. Their list was just shown; the change made here has to be made again on top of it. */
  conflict: () => void;
  /** The list on screen landed on the hub. After a failed try, the warning can come down. */
  saved: () => void;
  /** A save was refused or the hub was out of reach; `text` says which. It is sent again until it lands. */
  failed: (text: string) => void;
}

export interface ChoreAutosaveOptions {
  /** The list the page was drawn with, already saved; absent when the surface loads it itself. */
  initial?: ChoreSnapshot;
  /** Off until the surface has loaded a list, so nothing is saved before then. Default true. */
  enabled?: boolean;
  /** Send a pending save when the surface unmounts. Default false. */
  flushOnUnmount?: boolean;
  /** This surface's words for a failed save: a refusal without a sentence of its own, and a hub out of reach. */
  words: { refused: string; unreachable: string };
}

/**
 * The chore list's auto-save, shared by the editor's chore window and the
 * phone's Chores tab. Saves go through one `ChoreSession`: in order, each
 * quoting the revision the previous one was answered with, so a list from an
 * older copy cannot overwrite what another surface saved since.
 *
 * The rules both surfaces follow live here, once:
 * - A list the hub handed over (`adopt`) is already saved and is never sent back.
 * - An empty list that is not the adopted one is a deliberate deletion of the
 *   last chore, so it is sent with `force`, past the hub's empty-list guard.
 *   A load, a reload or a conflict's copy never grants that.
 * - A save that failed is sent again when the device is back on the network
 *   and every few seconds until it lands. The list on screen already shows
 *   the change, so leaving it unsent meant a chore that looked saved and was
 *   gone after a reload.
 * - After a conflict, the other surface's copy is shown and the local change
 *   is dropped rather than saved over it.
 */
export function useChoreAutosave(
  chores: ChoreDefinition[],
  surface: ChoreAutosaveSurface,
  { initial, enabled = true, flushOnUnmount = false, words }: ChoreAutosaveOptions,
) {
  // Read when an answer lands, so the surface's latest words and state are used.
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const [session] = useState(() => new ChoreSession(editorFetch, initial));
  // The list the hub holds, as this surface last received or saved it. The
  // list on screen differing from it is an edit not yet saved.
  const savedRef = useRef<ChoreDefinition[] | null>(initial?.chores ?? null);
  const choresRef = useRef(chores);
  choresRef.current = chores;
  const [unsaved, setUnsaved] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);

  const adopt = useCallback((snapshot: ChoreSnapshot) => {
    savedRef.current = snapshot.chores;
    session.adopt(snapshot);
    surfaceRef.current.show(snapshot);
  }, [session]);

  /** Whether the list on screen is the one the hub holds (no edit waiting to be saved). */
  const clean = useCallback(() => choresRef.current === savedRef.current, []);

  useEffect(() => {
    if (!unsaved) return;
    const again = () => setSaveAttempt((n) => n + 1);
    window.addEventListener('online', again);
    const id = setInterval(again, CHORE_SAVE_RETRY_MS);
    return () => {
      window.removeEventListener('online', again);
      clearInterval(id);
    };
  }, [unsaved]);

  const { flush } = useDebouncedSave({
    values: [chores, saveAttempt],
    enabled,
    flushOnUnmount,
    save: async () => {
      if (chores === savedRef.current) return;
      const outcome = await session.save(chores, chores.length === 0, wordsRef.current.refused);
      if (outcome.kind === 'conflict') {
        adopt(outcome.snapshot);
        setUnsaved(false);
        surfaceRef.current.conflict();
        return;
      }
      if (outcome.kind === 'superseded') return;
      savedRef.current = chores;
      setUnsaved(false);
      surfaceRef.current.saved();
    },
    // The session rejects on any failure; without that a 500 resolved and this
    // never fired: the edit stayed on screen and was gone after reload.
    onError: (err) => {
      if (isSessionExpired(err)) return;
      setUnsaved(true);
      surfaceRef.current.failed(requestFailureText(err, { unreachable: wordsRef.current.unreachable, fallback: wordsRef.current.refused }));
    },
  });

  return { session, adopt, clean, flush, unsaved };
}
