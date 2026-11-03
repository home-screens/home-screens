import type { PointerEvent } from 'react';

/**
 * Every button a finger presses on the wall carries this class: globals.css
 * draws it pressed (darker, a little smaller) while `data-pressed` is set or
 * `:active` holds.
 */
export const WALL_BUTTON_CLASS = 'wall-btn';

/**
 * A row a finger ticks (a to-do, a chore, a grocery line) carries this one
 * instead: it tints rather than shrinks, since a full-width row that shrinks
 * reads as the list jumping. The checkbox's own glow then says the tick is
 * on its way to the hub (`TapCheckbox` `pressed`).
 */
export const WALL_ROW_CLASS = 'wall-row';

type PressEvent = PointerEvent<HTMLElement>;

interface PressHandlers {
  onPointerDown?: (e: PressEvent) => void;
  onPointerUp?: (e: PressEvent) => void;
  onPointerCancel?: (e: PressEvent) => void;
  onPointerLeave?: (e: PressEvent) => void;
}

const press = (e: PressEvent) => e.currentTarget.setAttribute('data-pressed', '');
const release = (e: PressEvent) => e.currentTarget.removeAttribute('data-pressed');

/**
 * The pressed look, set on the element itself the moment a finger lands.
 * Chromium only applies `:active` to a touch once it knows the touch is not
 * a scroll, and on a Pi a tap whose answer takes a quarter of a second to
 * draw (a new week, a recipe page) gets tapped again in that gap. The
 * attribute needs no render.
 */
export const wallPressProps = {
  className: WALL_BUTTON_CLASS,
  onPointerDown: press,
  onPointerUp: release,
  onPointerCancel: release,
  onPointerLeave: release,
};

/** `wallPressProps` for a row: the tint, not the shrink. */
export const wallRowPressProps = { ...wallPressProps, className: WALL_ROW_CLASS };

function withOwn<T extends PressHandlers>(base: typeof wallPressProps, className: string | undefined, own: T | undefined) {
  const cls = className ? `${base.className} ${className}` : base.className;
  if (!own) return { ...base, className: cls };
  // The press first, then the element's own gesture (a hold to un-check).
  const both = (mine: (e: PressEvent) => void, theirs?: (e: PressEvent) => void) => (e: PressEvent) => { mine(e); theirs?.(e); };
  return {
    ...own,
    className: cls,
    onPointerDown: both(press, own.onPointerDown),
    onPointerUp: both(release, own.onPointerUp),
    onPointerCancel: both(release, own.onPointerCancel),
    onPointerLeave: both(release, own.onPointerLeave),
  };
}

/** `wallPressProps` for a button with classes, or pointer handlers, of its own. */
export function wallPress<T extends PressHandlers>(className?: string, own?: T) {
  return withOwn(wallPressProps, className, own);
}

/** `wallRowPressProps` for a row with classes, or pointer handlers, of its own. */
export function wallRowPress<T extends PressHandlers>(className?: string, own?: T) {
  return withOwn(wallRowPressProps, className, own);
}
