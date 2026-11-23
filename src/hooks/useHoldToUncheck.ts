'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useHoldConfirm } from './useHoldConfirm';

/** How long the hold takes. Long enough to be deliberate, short enough not to feel stuck. */
export const UNCHECK_HOLD_MS = 700;
/** How long the "press and hold" hint stays up after a press that did not finish one. */
const HINT_MS = 1800;

export interface HoldToUncheckHandlers {
  onClick: (e: MouseEvent<HTMLElement>) => void;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: PointerEvent<HTMLElement>) => void;
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void;
}

export interface UseHoldToUncheckResult {
  /** Key of the row being held right now, so it can draw the hold running. */
  holdingKey: string | null;
  /** 0..1 progress of the hold in flight. */
  progress: number;
  /** Key of the row that was pressed without a hold finishing, so it can say so. */
  hintKey: string | null;
  /**
   * Handlers for one row. `holdMode` is true only when un-checking, which is
   * the gesture that needs guarding; checking a chore off stays a single tap.
   */
  rowHandlers: (key: string, holdMode: boolean, onToggle: () => void) => HoldToUncheckHandlers;
}

/**
 * Press-and-hold to un-check, for the chore surfaces where a finished chore
 * can be undone by a passer-by: the card chore chart on the wall (its views
 * and its bonus rows) and the kids' page (whose chore rows the phone shares).
 * A tap is how a sibling "accidentally" undoes someone else's work, and
 * un-checking also debits tickets that may already be spent; a hold is
 * deliberate. Checking a chore off stays an instant tap. The full-screen
 * chore chart is the exception on
 * purpose: its dots take a plain tap both ways, and an Undo on its toast takes
 * a mistaken un-tick back (`AssigneeDot`).
 *
 * One hold at a time, and it belongs to the pointer that began it.
 *
 * Two fingers land on a wall like this constantly, so the hold in flight is
 * tracked by `pointerId`: only the finger that started a hold can finish it,
 * and only on the row it started on. A second finger arriving mid-hold neither
 * takes the hold over nor inherits the time already spent on it, because both
 * would un-tick a chore nobody deliberately held. It is told why nothing
 * happened, and can hold for itself as soon as the first hold ends. The
 * alternative, cancelling the running hold, would let any passing touch break
 * a deliberate gesture, which is the thing this exists to protect.
 */
export function useHoldToUncheck(): UseHoldToUncheckResult {
  const [holdingKey, setHoldingKey] = useState<string | null>(null);
  const [hintKey, setHintKey] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  /** The pointer that owns the hold in flight, the row it is on, and what it does. */
  const holder = useRef<{ pointerId: number; key: string; onToggle: () => void } | null>(null);
  /**
   * The pointer whose hold already ran. Its release is expected and must not
   * be read as a press that fell short, so it gets no hint.
   */
  const firedPointer = useRef<number | null>(null);
  // The click that follows a completed hold has to be swallowed: by then the
  // row has re-rendered as "not done", and a click there would check the
  // chore straight back off.
  const swallowClick = useRef(false);

  const showHint = useCallback((key: string) => {
    setHintKey(key);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHintKey(null), HINT_MS);
  }, []);

  const hold = useHoldConfirm({
    durationMs: UNCHECK_HOLD_MS,
    onConfirm: () => {
      const owner = holder.current;
      // The timer can only be running for a hold someone started, but if that
      // pointer is already gone there is nothing left to act on.
      if (!owner) return;
      firedPointer.current = owner.pointerId;
      // Free the slot at the moment it fires rather than on release: a finger
      // that never sends its pointerup must not block every later hold.
      holder.current = null;
      swallowClick.current = true;
      setHoldingKey(null);
      setHintKey(null);
      owner.onToggle();
    },
  });

  const rowHandlers = (key: string, holdMode: boolean, onToggle: () => void): HoldToUncheckHandlers => ({
    onClick: (e) => {
      if (swallowClick.current) {
        swallowClick.current = false;
        return;
      }
      // Keyboard activation (Enter/Space) arrives as a click with detail 0; a
      // keyboard user cannot hold, so it toggles directly.
      if (holdMode && e.detail !== 0) return;
      onToggle();
    },
    onPointerDown: (e) => {
      // A new gesture: whatever the last one left behind no longer applies.
      swallowClick.current = false;
      if (!holdMode) return;
      // Someone else's hold is already counting. This finger does not take it
      // over, and it gets none of the time that press has put in.
      if (holder.current) return;
      holder.current = { pointerId: e.pointerId, key, onToggle };
      firedPointer.current = null;
      setHintKey(null);
      setHoldingKey(key);
      hold.onPointerDown();
    },
    onPointerUp: (e) => {
      if (!holdMode) return;
      if (firedPointer.current === e.pointerId) {
        // Its hold already ran. Nothing fell short, so nothing to explain.
        firedPointer.current = null;
        return;
      }
      if (holder.current?.pointerId !== e.pointerId) {
        // A finger that never owned the hold: either it landed while another
        // was running, or it is a plain tap on a finished row. Both want the
        // same answer.
        showHint(key);
        return;
      }
      holder.current = null;
      setHoldingKey(null);
      hold.onPointerUp();
      showHint(key);
    },
    onPointerCancel: (e) => releasePointer(e),
    onPointerLeave: (e) => releasePointer(e),
    // A long press must not open the browser's copy/share sheet.
    onContextMenu: holdMode ? (e) => e.preventDefault() : undefined,
  });

  /** The browser took a pointer away (scroll, palm, finger off the row). */
  function releasePointer(e: PointerEvent<HTMLElement>) {
    if (firedPointer.current === e.pointerId) {
      firedPointer.current = null;
      return;
    }
    if (holder.current?.pointerId !== e.pointerId) return;
    holder.current = null;
    setHoldingKey(null);
    hold.onPointerCancel();
  }

  return { holdingKey, progress: hold.progress, hintKey, rowHandlers };
}
