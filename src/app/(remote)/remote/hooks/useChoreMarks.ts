'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChoreCompletion, ChoreDefinition, ChoreGrab } from '@/types/config';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { postChoreMarks, postChoreToggle, type ChoreMarks, type ChoreMarksWrite, type ChoreWriteOutcome } from '@/lib/chore-client';
import { planChoreToggle } from '@/lib/chore-toggle';
import { countsSinceReset, resetViewDay, type BonusMarks, type BonusRefusal } from '@/lib/chore-bonus';
import { completionKey } from '@/lib/chore-assignments';
import { usePolledFetch } from '@/hooks/usePolledFetch';

/** How often the phone and the kids' page read the chores. */
export const CHORES_POLL_MS = 15_000;
/** How long a message under a row ("Cleo is already on that one") stays. */
export const ROW_NOTICE_MS = 5000;

/** One person's row for one chore on one day: where a tick goes and where a word about it is said. */
export interface ChoreRowRef {
  choreId: string;
  memberId: string;
  date: string;
}

/**
 * A word said under one row, and gone after a few seconds, not a red banner
 * at the top of the page. Kept with the person and day it was said to:
 * switching to another child or day must not show it under their row.
 */
export interface ChoreRowNotice extends ChoreRowRef {
  text: string;
  /** "Finish your grab first": goes as soon as that stops being true. */
  limit?: boolean;
}

/** What the chores read answers with: the lists, plus what the surface reads out of it (the chore list, the roster, the hub's day, the settings). */
export interface ChoresReadAnswer extends Partial<ChoreMarks> {
  today?: unknown;
  settings?: unknown;
  chores?: unknown;
  choresRevision?: unknown;
  family?: unknown;
}

export interface ChoreMarksWords {
  /** Under the row: a write that did not save. */
  failed: string;
  /** Under the row: what a refusal means, or null to say nothing (the lists it carries say it on their own). */
  refusal: (refused: { reason: BonusRefusal; memberId?: string }) => string | null;
}

export interface UseChoreMarksOptions<Before = unknown> {
  /** The chores read: the kids' page asks for the recent days, the phone for all of it. */
  url: string;
  chores: ChoreDefinition[];
  /** The household's today, which decides which round a bonus chore's earlier ticks belong to. */
  today: string;
  /**
   * Read as each poll goes out, handed back with its answer: a surface can
   * tell whether something of its own changed meanwhile (a settings save that
   * overlapped the read would be put back by the read's older copy).
   */
  before?: () => Before;
  /** A poll's answer, after the lists in it were taken. */
  onPoll?: (answer: ChoresReadAnswer, before: Before) => void;
  /** The device is back on the network; the lists are read again on their own. */
  onOnline?: () => void;
  /** A write with no row to speak under did not save: said in the page's banner. */
  onWarning: (text: string) => void;
  words: ChoreMarksWords;
}

/**
 * The lists behind the phone's Today view and the kids' page: ticks, who is
 * holding which bonus chore, and when each "put it back" one was last put
 * back. Read every few seconds while the tab is in view, and written by a
 * tick, a grab, a "not today" or a put-back.
 *
 * A tick shows at once. The hub's answer, taken or refused, carries the
 * lists, and they replace what is shown; without them (a hub out of reach, a
 * refusal with no lists) the tick comes off again and the next poll shows
 * the truth. That is the wall's rule too (`useChoreData`), through the same
 * `postChoreToggle`. The other writes show only the answer: a grab row is
 * busy until the hub says who has it.
 *
 * This is not a `WriteSession`: a refusal here is an answer with lists and a
 * reason, not an error sentence, and a tick's direction has to be planned
 * from the lists at the moment of the tap, for the request going out.
 */
export function useChoreMarks<Before = unknown>(options: UseChoreMarksOptions<Before>) {
  // Read when an answer lands, so the surface's latest words and lists are used.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [completions, setCompletions] = useState<ChoreCompletion[]>([]);
  const [grabs, setGrabs] = useState<ChoreGrab[]>([]);
  const [bonusResets, setBonusResets] = useState<Record<string, string>>({});
  // The lists as of the last render, for a tap that must plan from the latest.
  const completionsRef = useRef(completions);
  completionsRef.current = completions;
  const bonusResetsRef = useRef(bonusResets);
  bonusResetsRef.current = bonusResets;
  /** Rows with a write out, by `completionKey` for a tick and `bonus-<choreId>` for the rest. */
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [rowNotice, setRowNotice] = useState<ChoreRowNotice | null>(null);

  // In-flight answers must not set state after the tab is gone.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!rowNotice) return;
    const id = setTimeout(() => setRowNotice(null), ROW_NOTICE_MS);
    return () => clearTimeout(id);
  }, [rowNotice]);

  // Every chore route answers with the same lists. Each is kept identity-
  // stable when its content is unchanged, so a quiet poll re-renders nothing.
  const applyMarks = useCallback((marks: Partial<ChoreMarks>) => {
    const keep = <T,>(next: T | undefined) => (prev: T): T =>
      next === undefined || JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    setCompletions(keep(marks.completions));
    setGrabs(keep(marks.grabs));
    setBonusResets(keep(marks.bonusResets));
  }, []);

  // Each read cancels the one before it still out.
  const readAbortRef = useRef<AbortController | null>(null);
  const read = useCallback(async () => {
    readAbortRef.current?.abort();
    const controller = new AbortController();
    readAbortRef.current = controller;
    const { url, before, onPoll } = optionsRef.current;
    const stamp = before?.() as Before;
    try {
      const res = await editorFetch(url, { signal: controller.signal });
      if (!res.ok) return;
      const answer = await res.json() as ChoresReadAnswer;
      if (!mountedRef.current || controller.signal.aborted) return;
      applyMarks(answer);
      onPoll?.(answer, stamp);
    } catch { /* silent, an abort included; the next poll reads again */ }
  }, [applyMarks]);

  usePolledFetch((_isMounted, reason) => {
    if (reason === 'online') optionsRef.current.onOnline?.();
    void read();
  }, [read, options.url], { intervalMs: CHORES_POLL_MS, pauseWhenHidden: true });
  useEffect(() => () => readAbortRef.current?.abort(), []);

  const setRowBusy = useCallback((key: string, on: boolean) => {
    if (!mountedRef.current) return;
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  /** The tick comes off again, unless something else has landed on the lists meanwhile. */
  const restore = useCallback((shown: ChoreCompletion[], before: ChoreCompletion[]) => {
    setCompletions((current) => (current === shown ? before : current));
  }, []);

  const sayRefusal = useCallback((row: ChoreRowRef, outcome: ChoreWriteOutcome & { ok: false; refused: true }) => {
    const { words } = optionsRef.current;
    const text = outcome.refusal ? words.refusal({ reason: outcome.refusal, memberId: outcome.memberId }) : words.failed;
    if (text) setRowNotice({ ...row, text });
  }, []);

  /**
   * Tick or un-tick one row. Resolves with what the hub made of it, so the
   * surface can take the rewards it moved or call off a celebration.
   */
  const toggle = useCallback(async (row: ChoreRowRef): Promise<ChoreWriteOutcome> => {
    const { choreId, memberId, date } = row;
    const key = completionKey(choreId, memberId, date);
    setRowBusy(key, true);
    // One plan drives both the optimistic update and the direction the server
    // is told. Sending the direction makes the write idempotent, so two people
    // reaching for one chore at the same moment no longer flip it twice and
    // leave it undone. Worked out here rather than inside a state updater:
    // React may run an updater during the next render instead of at the call,
    // and the direction has to be known now, for the request below.
    const { chores, today } = optionsRef.current;
    const chore = chores.find((c) => c.id === choreId);
    const before = completionsRef.current;
    const resets = bonusResetsRef.current;
    const plan = planChoreToggle(before, choreId, memberId, date, (c) => !chore || countsSinceReset(chore, c, resets, resetViewDay(date, today)));
    setCompletions(plan.completions);

    const outcome = await postChoreToggle(editorFetch, { choreId, memberId, date, direction: plan.direction });
    if (!mountedRef.current) return outcome;
    if (outcome.ok) {
      applyMarks(outcome.answer);
      // This one saved, so a "that didn't save" under the row has been answered.
      setRowNotice((notice) => (notice?.choreId === choreId ? null : notice));
    } else if (outcome.refused) {
      // A bonus chore someone else got to first: say who under the row, and
      // show where it stands now from the lists the answer carries.
      if (outcome.marks) applyMarks(outcome.marks);
      else restore(plan.completions, before);
      sayRefusal(row, outcome);
    } else {
      // Nothing was saved, so the tick comes off again now, with a word under
      // the row about why. Left on until the next poll, it looked done (and,
      // with no network, stayed looking done) and then quietly was not.
      restore(plan.completions, before);
      if (!isSessionExpired(outcome.error)) setRowNotice({ ...row, text: optionsRef.current.words.failed });
    }
    setRowBusy(key, false);
    return outcome;
  }, [applyMarks, restore, sayRefusal, setRowBusy]);

  /**
   * Grab, let go, "not today" and put back. `row` is whose row is busy and
   * where a refusal is said; a failure with nothing to say under a row goes
   * to the banner.
   */
  const write = useCallback(async (request: ChoreMarksWrite, row: ChoreRowRef): Promise<ChoreWriteOutcome> => {
    const key = request.kind === 'skip' ? completionKey(row.choreId, row.memberId, row.date) : `bonus-${row.choreId}`;
    setRowBusy(key, true);
    const outcome = await postChoreMarks(editorFetch, request);
    if (!mountedRef.current) return outcome;
    if (outcome.ok) {
      applyMarks(outcome.answer);
    } else if (outcome.refused && outcome.refusal) {
      if (outcome.marks) applyMarks(outcome.marks);
      sayRefusal(row, outcome);
    } else if (outcome.refused || !isSessionExpired(outcome.error)) {
      optionsRef.current.onWarning(optionsRef.current.words.failed);
    }
    setRowBusy(key, false);
    return outcome;
  }, [applyMarks, sayRefusal, setRowBusy]);

  const marks = useMemo<BonusMarks>(() => ({ completions, grabs, bonusResets }), [completions, grabs, bonusResets]);

  return {
    completions,
    grabs,
    bonusResets,
    /** The three lists together, the shape the bonus rules read. */
    marks,
    busy,
    rowNotice,
    setRowNotice,
    /** Read the lists again now (after a family change, say). */
    refresh: read,
    toggle,
    write,
  };
}
