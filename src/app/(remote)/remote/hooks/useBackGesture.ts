'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

/**
 * The overlays standing on the history entry the page is on, bottom first.
 * Every entry an overlay pushes carries the whole stack under it as well as
 * its own id, so what is open is read back off the stack rather than tracked
 * beside it: a flag and a history stack drift apart the moment a traversal is
 * in flight.
 */
function stackHere(): readonly string[] {
  return (window.history.state as { hsSheets?: string[] } | null)?.hsSheets ?? [];
}

/**
 * The overlays that are open and still hold their entry. An entry on the
 * stack whose overlay is not in here is spent: the overlay closed by its own
 * control, or went with the one under it ("Delete chore?" and the chore form
 * close on one tap). Spent entries are taken off the top of the stack (see
 * `tidy`), so Back never lands on a step that does nothing.
 *
 * React mounts, tears down and remounts every effect a second time in
 * development. The teardown takes the overlay out of here and the remount
 * puts it back before `tidy` runs, so a development remount performs no
 * traversal at all: a traversal started by that teardown would still be
 * travelling when the overlay mounted again, and would come back looking
 * exactly like a person pressing Back.
 *
 * Module scope on purpose: it has to outlive the component state that React
 * throws away between those two mounts.
 */
const open = new Set<string>();

/**
 * Whether this document is on its way to another page.
 *
 * A traversal started while the browser is already fetching the next document
 * cancels that navigation, and the tab sits on the old page with nothing to
 * say why. The window is real: an overlay dismissed by its own save gives its
 * entry back a macrotask later, which is long enough for something else to
 * have started a navigation in between.
 *
 * So once the page is leaving, no overlay reaches for its entry again: the
 * whole stack belongs to the next document. `pageshow` clears it for a page
 * restored from the back/forward cache, which is alive again and owns its
 * stack.
 */
let leavingPage = false;

/**
 * The entry a traversal started by `tidy` left from, until its `popstate`
 * arrives. While the page still stands on that same entry the traversal is in
 * flight; once the entry has changed, by that traversal or by anything else,
 * it is not.
 */
let travelledFrom: { state: unknown } | null = null;
let travelTimeout: ReturnType<typeof setTimeout> | undefined;
/** Entries asked for while a traversal was in flight, pushed once it lands. */
const afterTravel: Array<() => void> = [];

/** A traversal the browser never delivers (the page went away under it) must not hold up every later one. */
const TRAVEL_TIMEOUT_MS = 1000;

function travelling(): boolean {
  return travelledFrom !== null && window.history.state === travelledFrom.state;
}

function landed(): void {
  travelledFrom = null;
  clearTimeout(travelTimeout);
  for (const take of afterTravel.splice(0)) take();
  // Back may have landed on a spent entry: step over it as well.
  queueTidy();
}

/**
 * Takes every spent entry off the top of the stack in one traversal. Never
 * starts one over another already in flight, and never one at all while the
 * page is leaving (see `leavingPage`).
 */
function tidy(): void {
  // A queued tidy can outlive the page it was queued on (a test tearing down its window).
  if (typeof window === 'undefined' || leavingPage || travelling()) return;
  const stack = stackHere();
  let spent = 0;
  while (spent < stack.length && !open.has(stack[stack.length - 1 - spent])) spent += 1;
  if (spent === 0) return;
  travelledFrom = { state: window.history.state };
  clearTimeout(travelTimeout);
  travelTimeout = setTimeout(landed, TRAVEL_TIMEOUT_MS);
  if (spent === 1) window.history.back();
  else window.history.go(-spent);
}

/** One turn later, so a remount in the same commit can take its entry back first. */
function queueTidy(): void {
  setTimeout(tidy, 0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { leavingPage = true; });
  window.addEventListener('pagehide', () => { leavingPage = true; });
  window.addEventListener('pageshow', () => { leavingPage = false; });
  // Registered before any overlay's own listener, so an entry held back by a
  // traversal is pushed before the overlays read where Back landed.
  window.addEventListener('popstate', landed);
}

/**
 * One history entry held for as long as an overlay is open, so the Back
 * gesture, the first thing a thumb reaches for to leave one, closes the
 * overlay instead of unloading the remote and the typed text in it. Every
 * phone overlay takes one: the full-screen forms, the photo viewer, the
 * Family screen and every sheet (through `SheetFrame`).
 *
 * Overlays stack. Each one's entry sits on the entries of the overlays open
 * under it, so Back closes the one on top: a sheet opened over a form, then
 * the form; a confirm over a sheet, then the sheet. Overlays that close
 * together give their entries back in one traversal. Entries are taken in
 * the order the overlays open, and React runs a child's effects before its
 * parent's, so a sheet drawn inside a form opens after the form (from a tap,
 * as every phone flow does), not in the same render.
 *
 * `onBack` runs when the person goes back past this overlay's entry, but not
 * for a traversal the overlay started itself, nor when an overlay stacked on
 * top of it closed. It returns true when the overlay stays open (a prompt it
 * answered instead, a save in flight), and the entry is taken again.
 *
 * `active` is for an overlay that stays mounted while closed (Settings): it
 * holds an entry only while active. Call `release()` as the overlay starts to
 * close by its own control when it stays mounted a while after (a slide out);
 * one dismissed any other way gives its entry back when it unmounts.
 */
export function useBackGesture(onBack: () => boolean, { active = true }: { active?: boolean } = {}): { release: () => void } {
  const entryId = useId();
  const released = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const takeEntry = useCallback(() => {
    const push = () => {
      // Closed again before a traversal in flight landed, or already holding one.
      if (!open.has(entryId) || stackHere().includes(entryId)) return;
      // Same URL, so nothing about the address changes and a reload still
      // lands on the tab the overlay was opened from.
      window.history.pushState(
        { ...(window.history.state ?? {}), hsSheets: [...stackHere(), entryId] },
        '',
        window.location.href,
      );
    };
    // Pushed under a traversal in flight, the entry would be the one that
    // traversal takes away.
    if (travelling()) afterTravel.push(push);
    else push();
  }, [entryId]);

  useEffect(() => {
    if (!active) return;
    released.current = false;
    open.add(entryId);
    takeEntry();
    function onPopState() {
      // Closing already: whatever travelled, it is not this overlay's to answer.
      if (released.current) return;
      // Still standing on this overlay's entry: an overlay stacked on top of
      // it closed, or `tidy` stepped over a spent one.
      if (stackHere().includes(entryId)) return;
      // Anything that keeps the overlay open has to keep its entry too.
      if (onBackRef.current()) takeEntry();
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Dismissed some other way (a save that closed it): give the entry back,
      // or Back would land on a step that does nothing. One turn later: see
      // `open` for why this cannot travel on the spot.
      open.delete(entryId);
      queueTidy();
    };
  }, [active, entryId, takeEntry]);

  const release = useCallback(() => {
    released.current = true;
    open.delete(entryId);
    tidy();
  }, [entryId]);

  return { release };
}
