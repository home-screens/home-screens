'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HubUnreachableError,
  MealClientError,
  MealieShoppingRefusal,
  addToMealieShoppingList,
  chooseMealieShoppingList,
  loadMealieShopping,
  removeMealieShoppingItem,
  tickMealieShoppingItem,
  type MealFetch,
  type MealieShoppingWire,
} from '@/lib/meal-client';
import { mealieProblem, type MealieProblem } from '@/lib/meal-sources';
import {
  foldedOnOpen,
  setShoppingItemChecked,
  shoppingAddPlan,
  shoppingCounts,
  shoppingListView,
  shoppingPutBack,
  type ShoppingGroup,
  type ShoppingItem,
  type ShoppingList,
  type ShoppingListSummary,
} from '@/lib/shopping-list';

/** How often an open Grocery tab asks again, so a tick made in Mealie's app shows up at the store. */
export const SHOPPING_REFRESH_MS = 30_000;
/** A run of ticks asks Mealie again once, a moment after the last. */
const AFTER_WRITE_REFRESH_MS = 1500;
/** How long the line under the box (with its Undo) and a notice stay. */
const LINE_MS = 6000;
/** A tick still on its way after this looks unsaved, so a stall is not mistaken for done. */
const PENDING_AFTER_MS = 2000;
/** Ticks that fail together are reported together. */
const FAILURE_BATCH_MS = 400;

export type MealieShoppingAction = 'tick' | 'add' | 'choose' | 'undo';

/** Why the list on screen is not fresh: Mealie's reasons, or this device not reaching the hub. */
export type MealieShoppingProblem = MealieProblem | 'connection';

/** What just happened to the list on screen, said under the list chooser. */
export type MealieShoppingNotice =
  /** This device picked `list` for the whole family; Undo picks the old one again. */
  | { kind: 'picked'; list: string; undo: () => void }
  /** Somebody picked `list` on another device. */
  | { kind: 'moved'; list: string }
  /** `from` was deleted in Mealie, so the tab shows `list` now. */
  | { kind: 'gone'; from: string; list: string };

/** What the last add did, said under the box. */
export interface MealieShoppingAdded {
  /** `already`: it was on the list to get; `putBack`: it was ticked and is to get again. */
  kind: 'added' | 'already' | 'putBack';
  text: string;
  list: string;
  /** The label Mealie filed it under. */
  label: string | null;
  /** Takes a new item back off the list; absent when nothing new was made. */
  undo?: () => void;
}

export interface MealieShoppingTab {
  /** `failed`: no copy at all (`problem` says why). */
  state: 'loading' | 'ready' | 'failed';
  problem: MealieShoppingProblem | null;
  /** The list on screen is the last good copy, from `fetchedAt`. */
  stale: boolean;
  fetchedAt: number | null;
  lists: ShoppingListSummary[];
  /** The list shown, with this visit's ticks on it; null when the household has none. */
  list: ShoppingList | null;
  /** The list a pick is on its way to. The list on screen is the old one until it lands: take no taps. */
  choosing: string | null;
  /** Mealie's address, for Open Mealie, also when Mealie never answered. */
  baseUrl: string | null;
  /** What the tab draws: the groups, and what was ticked when it opened, folded away. */
  view: { groups: ShoppingGroup[]; folded: ShoppingItem[] };
  counts: { total: number; got: number };
  /** Ticks on their way to Mealie for a while. */
  pending: ReadonlySet<string>;
  justAdded: MealieShoppingAdded | null;
  notice: MealieShoppingNotice | null;
  adding: boolean;
  toggle: (item: ShoppingItem) => void;
  /** Resolves true once it is handled (added, already there, or put back); false leaves the words with the caller. */
  add: (text: string) => Promise<boolean>;
  choose: (listId: string) => void;
  retry: () => Promise<void>;
}

const NOTHING: ReadonlySet<string> = new Set();

function problemOf(err: unknown): MealieShoppingProblem {
  if (err instanceof HubUnreachableError) return 'connection';
  return err instanceof MealClientError && err.problem ? err.problem : mealieProblem(undefined);
}

function labelOf(list: ShoppingList | null, itemId: string | undefined): string | null {
  return list?.groups.find((g) => g.items.some((i) => i.id === itemId))?.label ?? null;
}

/**
 * The family's Mealie shopping list for a Grocery tab, shared by the phone and
 * the editor, which draw it their own way.
 *
 * Mounted while the tab is shown. What was already ticked when the tab opened
 * folds away (`foldedOnOpen`); a tick made here stays in place until the tab
 * is opened again, so a wrong tap is one tap to undo. A tick shows at once
 * and goes back, with `onError`, if Mealie does not take it. The list is read
 * again every 30 s while the page is in view, when the device is back online,
 * and shortly after a write; each read asks for the family's list, so a pick
 * made on another device shows here too.
 */
export function useMealieShoppingList(
  fetcher: MealFetch,
  { onError }: {
    /** `items` names what a failed tick or add was about. */
    onError: (err: unknown, action: MealieShoppingAction, items?: string[]) => void;
  },
): MealieShoppingTab {
  const [answer, setAnswer] = useState<MealieShoppingWire | null>(null);
  const [failed, setFailed] = useState<MealieShoppingProblem | null>(null);
  const [failedBaseUrl, setFailedBaseUrl] = useState<string | null>(null);
  /** A read failed after one succeeded: the copy on screen is older than it says. */
  const [lostTouch, setLostTouch] = useState<MealieShoppingProblem | null>(null);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [folds, setFolds] = useState<Readonly<Record<string, ReadonlySet<string>>>>({});
  const [added, setAdded] = useState<ReadonlySet<string>>(NOTHING);
  const [pending, setPending] = useState<ReadonlySet<string>>(NOTHING);
  const [justAdded, setJustAdded] = useState<MealieShoppingAdded | null>(null);
  const [notice, setNotice] = useState<MealieShoppingNotice | null>(null);
  const [adding, setAdding] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const answerRef = useRef(answer);
  answerRef.current = answer;
  /** The list as drawn (ticks on their way included), for the add rules. */
  const shownRef = useRef<ShoppingList | null>(null);
  /** Set while a pick is on its way: reads wait, so the old list never comes back over it. */
  const choosingRef = useRef<string | null>(null);
  /** Ticks on their way to Mealie, and ticks Mealie took, by the read that started after it took them. */
  const ticksRef = useRef(new Map<string, { checked: boolean; settledBefore: number }>());
  /** Each item's ticks in the order they were made: two at once could land in Mealie the other way round. */
  const tickChains = useRef(new Map<string, Promise<unknown>>());
  const failuresRef = useRef<{ err: unknown; names: string[] } | null>(null);
  const seqRef = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  /** A timer the unmount clears. */
  const later = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
    return timer;
  }, []);

  const syncOverrides = useCallback(() => {
    setOverrides(new Map([...ticksRef.current].map(([id, t]) => [id, t.checked])));
  }, []);

  const say = useCallback((next: MealieShoppingNotice | null) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(next);
    if (next) noticeTimer.current = later(() => setNotice(null), LINE_MS);
  }, [later]);

  const showAdded = useCallback((next: MealieShoppingAdded | null) => {
    if (lineTimer.current) clearTimeout(lineTimer.current);
    setJustAdded(next);
    if (next) lineTimer.current = later(() => setJustAdded(null), LINE_MS);
  }, [later]);

  /**
   * Take a read: fold what it shows ticked the first time a list is seen this
   * visit, and say so when the list on screen changed without a pick here.
   */
  const adopt = useCallback((next: MealieShoppingWire, seq: number, origin: 'read' | 'write') => {
    // A tick Mealie took before this read began is in it now.
    for (const [id, tick] of ticksRef.current) if (tick.settledBefore <= seq) ticksRef.current.delete(id);
    syncOverrides();
    const before = answerRef.current?.list;
    if (origin === 'read' && before && next.list && next.list.id !== before.id) {
      showAdded(null);
      say(next.lists.some((l) => l.id === before.id)
        ? { kind: 'moved', list: next.list.name }
        : { kind: 'gone', from: before.name, list: next.list.name });
    }
    if (next.list) {
      const list = next.list;
      setFolds((current) => (current[list.id] ? current : { ...current, [list.id]: foldedOnOpen(list) }));
    }
    answerRef.current = next;
    setAnswer(next);
    setFailed(null);
    setLostTouch(null);
  }, [syncOverrides, say, showAdded]);

  const load = useCallback(async () => {
    if (choosingRef.current) return;
    const seq = ++seqRef.current;
    try {
      const next = await loadMealieShopping(fetcher);
      if (!mounted.current || seq !== seqRef.current) return;
      adopt(next, seq, 'read');
    } catch (err) {
      if (!mounted.current || seq !== seqRef.current) return;
      const problem = problemOf(err);
      if (answerRef.current) {
        setLostTouch(problem);
      } else {
        setFailed(problem);
        if (err instanceof MealieShoppingRefusal && err.baseUrl) setFailedBaseUrl(err.baseUrl);
      }
    }
  }, [fetcher, adopt]);

  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = later(() => void load(), AFTER_WRITE_REFRESH_MS);
  }, [load, later]);

  useEffect(() => {
    mounted.current = true;
    const pendingTimers = timers.current;
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, SHOPPING_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const onOnline = () => void load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      for (const timer of pendingTimers) clearTimeout(timer);
      pendingTimers.clear();
    };
  }, [load]);

  const list = useMemo(() => {
    if (!answer?.list) return null;
    let next = answer.list;
    for (const [id, checked] of overrides) next = setShoppingItemChecked(next, id, checked);
    return next;
  }, [answer, overrides]);
  shownRef.current = list;

  // An item that leaves the fold (put back here, or by somebody in Mealie) is
  // to get again for the rest of the visit, at the head of its group: ticking
  // it again must not send it back into the fold under the finger.
  useEffect(() => {
    const fold = list ? folds[list.id] : undefined;
    if (!list || !fold) return;
    const back = shoppingPutBack(list, fold);
    if (back.length === 0) return;
    setFolds((current) => ({ ...current, [list.id]: new Set([...(current[list.id] ?? [])].filter((id) => !back.includes(id))) }));
    setAdded((current) => new Set([...current, ...back]));
  }, [list, folds]);

  const reportTickFailure = useCallback((err: unknown, name: string) => {
    if (failuresRef.current) {
      failuresRef.current.names.push(name);
      failuresRef.current.err = err;
      return;
    }
    failuresRef.current = { err, names: [name] };
    later(() => {
      const batch = failuresRef.current;
      failuresRef.current = null;
      if (batch && mounted.current) onErrorRef.current(batch.err, 'tick', batch.names);
    }, FAILURE_BATCH_MS);
  }, [later]);

  const toggle = useCallback((item: ShoppingItem) => {
    if (choosingRef.current) return;
    setNotice((current) => (current?.kind === 'picked' ? current : null));
    const checked = !(ticksRef.current.get(item.id)?.checked ?? item.checked);
    ticksRef.current.set(item.id, { checked, settledBefore: Infinity });
    syncOverrides();
    const slow = later(() => setPending((current) => new Set([...current, item.id])), PENDING_AFTER_MS);
    const run = (tickChains.current.get(item.id) ?? Promise.resolve())
      .catch(() => {})
      .then(() => tickMealieShoppingItem(fetcher, item.id, checked));
    tickChains.current.set(item.id, run);
    run.then(
      () => {
        const tick = ticksRef.current.get(item.id);
        // Settled by the next read to start; a later tap on the same item keeps its own.
        if (tick && tick.checked === checked) tick.settledBefore = seqRef.current + 1;
        if (mounted.current) refreshSoon();
      },
      (err: unknown) => {
        const tick = ticksRef.current.get(item.id);
        if (tick && tick.checked === checked) ticksRef.current.delete(item.id);
        syncOverrides();
        if (!mounted.current) return;
        if (err instanceof MealClientError && err.kind === 'conflict') void load();
        else reportTickFailure(err, item.text);
      },
    ).finally(() => {
      clearTimeout(slow);
      timers.current.delete(slow);
      if (tickChains.current.get(item.id) !== run) return;
      tickChains.current.delete(item.id);
      if (mounted.current) setPending((current) => (current.has(item.id) ? new Set([...current].filter((id) => id !== item.id)) : current));
    });
  }, [fetcher, load, refreshSoon, syncOverrides, later, reportTickFailure]);

  const undoAdd = useCallback((itemId: string) => {
    showAdded(null);
    setAdded((current) => new Set([...current].filter((id) => id !== itemId)));
    removeMealieShoppingItem(fetcher, itemId).then(
      () => void load(),
      (err: unknown) => {
        if (mounted.current) onErrorRef.current(err, 'undo');
      },
    );
  }, [fetcher, load, showAdded]);

  const add = useCallback(async (text: string): Promise<boolean> => {
    const words = text.trim();
    const shown = shownRef.current;
    if (!words || !shown || choosingRef.current) return false;
    setNotice((current) => (current?.kind === 'picked' ? current : null));
    const plan = shoppingAddPlan(shown, words);
    if (plan.kind !== 'new') {
      // Already there to get: nothing to add. Ticked: back on the list.
      if (plan.kind === 'putBack') toggle(plan.item);
      showAdded({ kind: plan.kind, text: plan.item.text, list: shown.name, label: labelOf(shown, plan.item.id) });
      return true;
    }
    setAdding(true);
    const seq = ++seqRef.current;
    try {
      const { wire, added: newId } = await addToMealieShoppingList(fetcher, shown.id, words);
      if (!mounted.current) return true;
      // The new item leads its group this visit. Mealie may file it under a
      // label by itself ("Lemons" under Produce), so the line under the box
      // says where it went rather than the page scrolling away from the box.
      if (newId) setAdded((current) => new Set([...current, newId]));
      adopt(wire, seq, 'write');
      showAdded({
        kind: 'added',
        text: words,
        list: wire.list?.name ?? shown.name,
        label: labelOf(wire.list, newId ?? undefined),
        ...(newId ? { undo: () => undoAdd(newId) } : {}),
      });
      return true;
    } catch (err) {
      if (mounted.current) {
        onErrorRef.current(err, 'add', [words]);
        if (err instanceof MealClientError && err.kind === 'conflict') void load();
      }
      return false;
    } finally {
      if (mounted.current) setAdding(false);
    }
  }, [fetcher, adopt, load, toggle, showAdded, undoAdd]);

  const pick = useCallback(function pickList(listId: string, quiet: boolean) {
    const before = answerRef.current?.list;
    if (!before || listId === before.id || choosingRef.current) return;
    choosingRef.current = listId;
    setChoosing(listId);
    showAdded(null);
    say(null);
    const seq = ++seqRef.current;
    chooseMealieShoppingList(fetcher, listId).then(
      (next) => {
        choosingRef.current = null;
        if (!mounted.current) return;
        setChoosing(null);
        adopt(next, seq, 'write');
        // One list for the whole family: say so, with a way back.
        if (!quiet && next.list) say({ kind: 'picked', list: next.list.name, undo: () => pickList(before.id, true) });
      },
      (err: unknown) => {
        choosingRef.current = null;
        if (!mounted.current) return;
        setChoosing(null);
        onErrorRef.current(err, 'choose');
        void load();
      },
    );
  }, [fetcher, adopt, load, say, showAdded]);
  const choose = useCallback((listId: string) => pick(listId, false), [pick]);

  const counts = useMemo(() => (list ? shoppingCounts(list) : { total: 0, got: 0 }), [list]);
  const view = useMemo(
    () => (list ? shoppingListView(list, { folded: folds[list.id] ?? NOTHING, added }) : { groups: [], folded: [] }),
    [list, folds, added],
  );
  const lists = useMemo(
    () => (answer?.lists ?? []).map((l) => (list && l.id === list.id ? { ...l, left: counts.total - counts.got } : l)),
    [answer, list, counts],
  );

  return {
    state: answer ? 'ready' : failed ? 'failed' : 'loading',
    problem: answer ? (lostTouch ?? (answer.failure ? mealieProblem(answer.failure) : null)) : failed,
    stale: answer?.status === 'stale' || lostTouch !== null,
    fetchedAt: answer?.fetchedAt ?? null,
    lists,
    list,
    choosing,
    baseUrl: answer?.baseUrl ?? failedBaseUrl,
    view,
    counts,
    pending,
    justAdded,
    notice,
    adding,
    toggle,
    add,
    choose,
    retry: load,
  };
}
