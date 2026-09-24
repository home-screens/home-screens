/**
 * After a sheet or menu closes because of a tap, a second tap near the same
 * spot is ignored for a moment. The first tap of a double tap picks a choice
 * and the sheet goes; the second lands on whatever the sheet was covering (a
 * chore row that never moved), ticking and paying for a chore nobody did.
 * Taps anywhere else go through at once.
 *
 * One listener set for the whole page, in the capture phase, so it runs
 * before any component's own handlers: pointer, mouse and touch presses as
 * well as clicks, because a row's hold-to-uncheck acts on pointer up.
 */

/** How long a second tap near the one that closed a sheet is ignored. */
export const SHEET_TAP_GUARD_MS = 1500;
/** How near counts, in CSS pixels. */
const RADIUS = 130;
/** A sheet that closed this soon after a press closed because of it. */
const CAUSED_MS = 800;

let lastPress: { x: number; y: number; at: number } | null = null;
let guard: { x: number; y: number; until: number } | null = null;
let installed = false;

const PRESS_EVENTS = ['pointerdown', 'mousedown', 'touchstart'] as const;
const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'] as const;

function pointOf(event: Event): { x: number; y: number } | null {
  if ('touches' in event) {
    const touch = (event as TouchEvent).changedTouches[0] ?? (event as TouchEvent).touches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  const mouse = event as MouseEvent;
  // A keyboard "click" has no position: it is never the stray half of a double tap.
  if (event.type === 'click' && mouse.detail === 0) return null;
  return { x: mouse.clientX, y: mouse.clientY };
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const type of PRESS_EVENTS) {
    window.addEventListener(type, (event) => {
      const point = pointOf(event);
      if (point) lastPress = { ...point, at: Date.now() };
    }, { capture: true, passive: true });
  }
  for (const type of BLOCKED_EVENTS) {
    window.addEventListener(type, (event) => {
      if (!guard || Date.now() > guard.until) return;
      const point = pointOf(event);
      if (!point || Math.hypot(point.x - guard.x, point.y - guard.y) > RADIUS) return;
      event.stopPropagation();
      if (event.cancelable && type === 'click') event.preventDefault();
    }, { capture: true });
  }
}

/** Starts listening for presses. Call from any sheet that should guard what is under it. */
export function watchSheetTaps(): void {
  install();
}

/** Call when a sheet closes: if a tap just closed it, a second tap near there is ignored for a moment. */
export function guardAfterSheetClose(): void {
  const press = lastPress;
  if (!press || Date.now() - press.at > CAUSED_MS) return;
  guard = { x: press.x, y: press.y, until: Date.now() + SHEET_TAP_GUARD_MS };
}
