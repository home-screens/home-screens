'use client';

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * How many of a list's notes fit its box whole, or null when they all do.
 *
 * A wall card has no scrollbar, so a list taller than its card would clip
 * whichever note fell on the edge in half and still claim "and 1 more" for
 * the notes it hid. Instead the notes that do not fit are dropped and counted
 * into the "and N more" line, the way the to-do module fits its rows.
 *
 * Every new `key` (a poll that changed the notes, a font or setting change)
 * and every resize renders all the notes once, measures, then renders only
 * the ones that fit; the layout effect runs before paint, so the full render
 * never shows.
 *
 * The measured items are the box's descendants marked `data-fit`:
 * - Without `priority`, in document order: the first item whose bottom
 *   passes the box ends the run (rows, grids, timeline groups).
 * - With `priority` (each item's `data-fit` value is its note id), heights
 *   are summed in that order, for a list drawn in another order than it is
 *   cut (Bubbles: cut by wall order, drawn oldest first).
 *
 * `reservePx` is room kept for the "and N more" line when cutting has to
 * start, in layout pixels; pass 0 when that line is already on screen
 * during the measure.
 */
export function useFitCount(
  boxRef: RefObject<HTMLElement | null>,
  key: string,
  reservePx: number,
  priority?: readonly string[],
): number | null {
  const [visible, setVisible] = useState<number | null>(null);
  // Bumped by a resize: when every row already fitted, `visible` is null and
  // stays null, so without this a shrinking card would never be re-measured
  // and its overflow would be clipped with no count.
  const [resizeTick, setResizeTick] = useState(0);
  const [measuredKey, setMeasuredKey] = useState(key);
  if (measuredKey !== key) {
    // New notes: show them all for one render so they can be measured.
    setMeasuredKey(key);
    setVisible(null);
  }
  const measure = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (rect.height <= 0) return;
    const items = Array.from(box.querySelectorAll<HTMLElement>('[data-fit]'));
    if (items.length === 0) return;
    // Rects are on-screen pixels, `reservePx` and the box's own height are
    // layout pixels; the editor canvas zooms its previews, so convert.
    const zoom = box.offsetHeight > 0 ? rect.height / box.offsetHeight : 1;
    const fit = priority
      ? fitByHeight(box, rect, items, priority, reservePx * zoom)
      : fitByPosition(rect, items, reservePx * zoom);
    setVisible((v) => (v === fit ? v : fit));
  }, [boxRef, reservePx, priority]);
  useLayoutEffect(() => {
    if (visible === null) measure();
  }, [visible, measure, key, resizeTick]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setVisible(null);
      setResizeTick((t) => t + 1);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [boxRef]);
  return visible;
}

function fitByPosition(box: DOMRect, items: HTMLElement[], reservePx: number): number | null {
  // Fractional rects, with a pixel of slack: rows are often n.5px tall, and
  // a rounded box height would otherwise refuse a row that fits.
  const limit = box.bottom + 1;
  const bottoms = items.map((el) => el.getBoundingClientRect().bottom);
  let fit = bottoms.findIndex((b) => b > limit);
  if (fit === -1) return null;
  while (fit > 0 && bottoms[fit - 1] > limit - reservePx) fit--;
  return fit;
}

function fitByHeight(box: HTMLElement, rect: DOMRect, items: HTMLElement[], priority: readonly string[], reservePx: number): number | null {
  const heights = new Map(items.map((el) => [el.dataset.fit ?? '', el.getBoundingClientRect().height]));
  // The gap is a layout length; scale it to the on-screen rects.
  const zoom = box.offsetHeight > 0 ? rect.height / box.offsetHeight : 1;
  const gap = (parseFloat(getComputedStyle(box).rowGap) || 0) * zoom;
  const room = rect.height + 1;
  const totals: number[] = [];
  let used = 0;
  for (const id of priority) {
    used += (totals.length > 0 ? gap : 0) + (heights.get(id) ?? 0);
    totals.push(used);
  }
  let fit = totals.findIndex((total) => total > room);
  if (fit === -1) return null;
  while (fit > 0 && totals[fit - 1] > room - reservePx) fit--;
  return fit;
}
