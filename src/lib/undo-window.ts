/** How long an Undo stays on offer after a change, on every surface. */
export const UNDO_WINDOW_MS = 8000;

/**
 * How long after a wall adds something the hub still lets that wall take it
 * off again (`wall-added.ts`). The wall's add sheet stops offering Undo on a
 * chip a little before this, so an Undo it shows is one the hub will take.
 */
export const WALL_UNDO_MS = 5 * 60_000;

/** How much sooner than the hub the wall stops offering Undo: room for the tap to reach it. */
export const WALL_UNDO_MARGIN_MS = 15_000;
