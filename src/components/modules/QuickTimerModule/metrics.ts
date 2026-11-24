/**
 * Sizing model for the Quick Timer widget.
 *
 * Every number the module draws comes from the measured box, the same way the
 * Display Control widget works and for the same reason: this is placed at
 * anything from a 170x120 corner tile to half a wall, and a fixed 26px number
 * with an 11px unit under it is unreadable at one end and lost at the other.
 *
 * Content drops in this order as the box shrinks: the heading, then the unit
 * word under each number, then the name of what is running.
 */

export interface QuickTimerBox {
  w: number;
  h: number;
  /** How many preset buttons are being drawn. */
  presets: number;
  /** A session is running, so the box holds a countdown instead of the grid. */
  running: boolean;
  /**
   * The card's Text size as a factor (1 = what the module shows on its own).
   *
   * Applied to every type size and nothing else: the household asked for
   * bigger numbers, not a different layout. Deliberately not clamped back to
   * the button, or asking for 150% on a widget whose type already fills its
   * box would do nothing at all.
   */
  textScale?: number;
}

export interface QuickTimerMetrics {
  gap: number;
  radius: number;
  cols: number;
  rows: number;
  /** Heading type size; 0 when the heading is dropped. */
  head: number;
  /** The big number on a preset button. */
  number: number;
  /** The unit word under it; 0 when dropped. */
  unit: number;
  /** The running countdown. */
  time: number;
  /** What is running, under the countdown; 0 when dropped. */
  name: number;
  /** Height of the control row, and the type in it. */
  ctrlH: number;
  ctrl: number;
  /** Progress bar thickness; 0 when there is no room for it. */
  bar: number;
  /** Icon box inside a control button. */
  ctrlIcon: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Box assumed before the first measurement, and in jsdom, which reports zero. */
const UNMEASURED = { w: 260, h: 150 };

/**
 * Columns and rows for `n` presets in a box of this shape. One row in a wide
 * box, one column in a tall one, otherwise as square as the count allows, so
 * a strip never becomes letterbox slivers.
 */
export function presetShape(n: number, aspect: number): [number, number] {
  if (n <= 1) return [1, 1];
  if (aspect >= n * 0.62) return [n, 1];
  if (aspect <= 0.42) return [1, n];
  const cols = n <= 4 ? 2 : 3;
  return [cols, Math.ceil(n / cols)];
}

export function quickTimerMetrics(box: QuickTimerBox): QuickTimerMetrics {
  const w = box.w > 0 ? box.w : UNMEASURED.w;
  const h = box.h > 0 ? box.h : UNMEASURED.h;
  const presets = Math.max(1, box.presets);

  const min = Math.min(w, h);
  const gap = clamp(min * 0.025, 4, 12);
  const radius = clamp(min * 0.05, 6, 16);
  // Text size multiplies the type and nothing else, and it is applied once at
  // the end: letting it feed back into the layout would make "150%" mean a
  // different shape as well as bigger numbers, and would stop being 150%.
  const type = box.textScale && box.textScale > 0 ? box.textScale : 1;

  // The card's own padding is the module's padding (ModuleWrapper measures
  // outside this), so the measured box is already the room there is.
  const innerW = w;
  // The heading is the first thing to go: in a corner tile the presets say
  // what this is better than a word over them would.
  const head = h >= 110 && innerW >= 120 ? clamp(h * 0.068, 9, 13) : 0;
  const innerH = Math.max(0, h - (head ? head + gap : 0));

  if (box.running) {
    const ctrlH = clamp(innerH * 0.3, 26, 54);
    const bar = innerH >= 92 ? clamp(innerH * 0.05, 4, 8) : 0;
    const rest = Math.max(0, innerH - ctrlH - gap - (bar ? bar + gap : 0));
    const name = rest >= 54 && innerW >= 120 ? clamp(rest * 0.17, 9, 13) : 0;
    return {
      gap, radius, cols: 1, rows: 1, head: head * type, number: 0, unit: 0,
      time: clamp(Math.min(innerW / 4.2, rest - name), 15, 96) * type,
      name: name * type,
      ctrlH,
      ctrl: clamp(ctrlH * 0.32, 9, 15) * type,
      bar,
      ctrlIcon: clamp(ctrlH * 0.34, 10, 18),
    };
  }

  const aspect = innerH > 0 ? innerW / innerH : 1;
  const [cols, rows] = presetShape(presets, aspect);
  const bw = (innerW - gap * (cols - 1)) / cols;
  const bh = (innerH - gap * (rows - 1)) / rows;

  const unit = bh >= 46 && bw >= 44 ? clamp(bh * 0.14, 8, 14) : 0;
  return {
    gap, radius, cols, rows, head: head * type,
    // Two digits have to fit across the button, so the width share is the one
    // that binds on a narrow tile. The ceiling is high on purpose: this is
    // placed at half a wall as readily as in a corner, and a 54px "10" in a
    // 330x198 button reads as a mistake.
    number: clamp(Math.min(bw / 2.3, (bh - (unit ? unit * 1.5 : 0)) * 0.78), 11, 96) * type,
    unit: unit * type,
    time: 0, name: 0, ctrlH: 0, ctrl: 0, bar: 0, ctrlIcon: 0,
  };
}
