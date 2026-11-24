/**
 * Whether a touch on the wall means what is under the finger. A touch on a
 * sleeping or dimmed wall only wakes it, and for a moment after it wakes or
 * changes screen the same finger must not press anything. The display shell
 * (`ScreenRotator`) holds back clicks itself; a piece that acts on the
 * finger directly (the drawing page, the drawing sheet's buttons) asks here
 * instead, so a wake never leaves a line across somebody's drawing.
 *
 * Outside a display (the editor's canvas, a test) every touch counts.
 */
let gate: (() => boolean) | null = null;

/** The display shell says how it decides; it takes the gate away again when it unmounts. */
export function setWallTouchGate(next: (() => boolean) | null): void {
  gate = next;
}

export function wallTakesTouch(): boolean {
  return gate ? gate() : true;
}
