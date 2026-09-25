'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { shuffleArray } from '@/lib/shuffle';
import { stripMediaToken } from '@/lib/media-url';

/**
 * Cycles through indices 0..itemCount-1 on a timer.
 * Returns 0 and does not start a timer when itemCount <= 1.
 */
export function useRotatingIndex(itemCount: number, intervalMs: number): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (itemCount <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % itemCount);
    }, intervalMs);
    return () => clearInterval(id);
  }, [itemCount, intervalMs]);

  return index;
}

type MediaItem = { url: string; type: 'image' | 'video' };

/**
 * Where a slideshow stood when it last unmounted. A screen unmounts its
 * modules when it rotates away, so without this every return started again
 * on the first slide with a whole interval to wait: at the default 30 s
 * interval and 30 s screen dwell, the screen left just as the second photo
 * was due and the family saw the same picture on every visit.
 *
 * Assets are kept by their token-stripped URL, not as the items themselves.
 * Video URLs carry a signed token that expires, and a screen can come back
 * hours later, so a resume rebuilds the saved order from the list just
 * fetched.
 */
interface ResumePoint {
  /** The source the saved pass was dealt from. */
  batchKey: string | undefined;
  assets: string[];
  order: number[];
  shuffle: boolean;
  pos: number;
  /** How long the slide at `pos` was up before the module unmounted. */
  shownMs: number;
}

/**
 * A tab runs one wall, and a wall has a handful of slideshows; the cap only
 * stops leftovers from deleted modules piling up.
 */
const MAX_RESUME_POINTS = 32;
const resumePoints = new Map<string, ResumePoint>();

function rememberResumePoint(id: string, point: ResumePoint) {
  resumePoints.delete(id);
  resumePoints.set(id, point);
  if (resumePoints.size > MAX_RESUME_POINTS) resumePoints.delete(resumePoints.keys().next().value!);
}

/**
 * The saved pass rebuilt from `items`, for a module coming back to the same
 * source with the same assets. A different folder or album, a list that grew
 * or shrank, or a new deal from a shuffled album starts from the top.
 */
function takeResumePoint<T extends MediaItem>(
  id: string | undefined,
  batchKey: string | undefined,
  items: T[],
): { batch: T[]; point: ResumePoint } | null {
  if (!id) return null;
  const point = resumePoints.get(id);
  resumePoints.delete(id);
  if (!point || items.length <= 1 || point.batchKey !== batchKey || point.assets.length !== items.length) return null;
  const byAsset = new Map(items.map((item) => [stripMediaToken(item.url), item]));
  const batch = point.assets.map((asset) => byAsset.get(asset));
  return batch.every((item) => item !== undefined) ? { batch: batch as T[], point } : null;
}

/**
 * Rotation for mixed photo/video lists, where per-item duration replaces the
 * fixed interval: photo slides auto-advance after `intervalMs` (the timeout
 * resets on index change), video slides advance only when the caller invokes
 * `advance()` — wired to VideoLayer's onEnded, which already folds in error,
 * stall, and max-duration force-advance.
 *
 * `playVideos: false` (editor preview — videos show a poster and never play)
 * treats every slide as timed so the rotation still moves.
 *
 * Returns [batch, index, advance] where `batch` is the array actually being
 * walked. A refreshed `items` array is held pending while its `batchKey`
 * (the fetch URL) is unchanged: the current batch runs to completion, and
 * the refresh takes over when the rotation wraps — so a periodic re-shuffle
 * never swaps slides mid-pass or revisits photos early. A changed key (new
 * folder/album/source), a different length, or a one-item batch adopts
 * immediately. Callers that pass no key get length-based adoption instead.
 * Flipping `shuffle` rebuilds the visit order over the batch already playing,
 * in place — the current slide stays up and a held refresh still waits.
 *
 * With a `resumeId` (the module id on a real display), a remount carries on
 * from the slide after the one that was showing, in the same order, with the
 * URLs of the list it mounted with. A slide that was up for less than half
 * its interval, because the screen left just after it came up, is shown
 * again instead. Only an unmount saves, and only a mount's first list
 * resumes: a folder change inside one mount starts from the top.
 */
export function useMediaRotation<T extends MediaItem>(
  items: T[],
  intervalMs: number,
  shuffle = false,
  playVideos = true,
  batchKey?: string,
  resumeId?: string,
): [T[], number, () => void] {
  const pendingRef = useRef(items);
  const keyRef = useRef<string | undefined>(batchKey);
  const shuffleRef = useRef(shuffle);
  const builtRef = useRef(false);
  // Whether this mount has had its one chance to resume.
  const resumeTriedRef = useRef(false);
  const [active, setActive] = useState<T[]>(items);
  const [order, setOrder] = useState<number[]>([]);
  const [pos, setPos] = useState(0);

  const buildOrder = useCallback((length: number) => {
    const arr = Array.from({ length }, (_, i) => i);
    return length > 0 && shuffle ? shuffleArray(arr) : arr;
  }, [shuffle]);

  const adopt = useCallback((batch: T[]) => {
    setActive(batch);
    setOrder(buildOrder(batch.length));
    setPos(0);
  }, [buildOrder]);

  // Adopt the incoming batch now, or hold it until the pass wraps. Keyed
  // callers hold same-source refreshes until the pass wraps; without a key
  // the rule is length-based (matching the old count-driven rebuild), since
  // array identity is caller-dependent and cannot drive adoption.
  useEffect(() => {
    pendingRef.current = items;
    const changed = batchKey === undefined
      ? items.length !== active.length
      : keyRef.current !== batchKey || active.length <= 1 || active.length !== items.length;
    if (items.length === 0 || !builtRef.current || changed) {
      keyRef.current = batchKey;
      shuffleRef.current = shuffle;
      builtRef.current = true;
      const resumed = resumeTriedRef.current || items.length === 0 ? null : takeResumePoint(resumeId, batchKey, items);
      if (items.length > 0) resumeTriedRef.current = true;
      const saved = resumed?.point;
      const resumeAt = saved ? (saved.shownMs >= intervalMs / 2 ? saved.pos + 1 : saved.pos) : 0;
      if (resumed && resumeAt < resumed.batch.length) {
        setActive(resumed.batch);
        setOrder(resumed.point.shuffle === shuffle ? resumed.point.order : buildOrder(resumed.batch.length));
        setPos(resumeAt);
      } else {
        // Past the end of the saved pass is a wrap: a fresh pass over the newest list.
        adopt(items);
      }
    } else if (shuffleRef.current !== shuffle) {
      // Toggling shuffle has to rebuild the order right now: the reshuffle in
      // advance() only fires while shuffle is on, so turning it off would
      // otherwise leave the batch walking its shuffled order forever. Rebuild
      // over the batch already playing, not `items`, so a held refresh still
      // waits for the wrap — and keep `pos`, both because a checkbox should
      // not jump the slideshow back to its first photo and because a rebuild
      // landing on pos 0 would read as a wrap and adopt that held refresh.
      shuffleRef.current = shuffle;
      setOrder(buildOrder(active.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `active`, `intervalMs` and `resumeId` are read only when items/shuffle change, and must not re-run this
  }, [items, batchKey, shuffle, buildOrder]);

  // A held refresh takes over when the pass wraps back to the start.
  useEffect(() => {
    if (pos !== 0 || active.length === 0 || pendingRef.current === active) return;
    keyRef.current = batchKey;
    adopt(pendingRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on wrap commits only
  }, [pos]);

  const count = active.length;

  const advance = useCallback(() => {
    if (count <= 1) return;
    setPos((prev) => {
      const next = prev + 1;
      if (next >= count) {
        if (shuffle) setOrder((prevOrder) => shuffleArray(prevOrder));
        return 0;
      }
      return next;
    });
  }, [count, shuffle]);

  const index = order.length > 0 ? (order[pos % order.length] ?? 0) : 0;
  const isEventDriven = playVideos && active[index]?.type === 'video';

  useEffect(() => {
    if (count <= 1 || isEventDriven) return;
    const id = setTimeout(advance, intervalMs);
    return () => clearTimeout(id);
    // `pos` restarts the timer after each slide change, including wrap-around
    // to the same index after a reshuffle.
  }, [count, isEventDriven, pos, index, intervalMs, advance]);

  // What is on screen, for the unmount below to save.
  const playingRef = useRef({ active, order, pos });
  playingRef.current = { active, order, pos };
  const shownSinceRef = useRef(0);
  useEffect(() => {
    shownSinceRef.current = Date.now();
  }, [active, order, pos]);

  useEffect(() => {
    if (!resumeId) return;
    return () => {
      const { active: batch, order: walked, pos: at } = playingRef.current;
      if (batch.length <= 1 || walked.length !== batch.length) return;
      rememberResumePoint(resumeId, {
        batchKey: keyRef.current,
        assets: batch.map((item) => stripMediaToken(item.url)),
        order: walked,
        shuffle: shuffleRef.current,
        pos: at,
        shownMs: Date.now() - shownSinceRef.current,
      });
    };
  }, [resumeId]);

  return [active, index, advance];
}
