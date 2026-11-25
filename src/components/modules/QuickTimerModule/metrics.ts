/**
 * Sizing model for the Quick Timer widget.
 *
 * Every number the module draws comes from the measured box, the same way the
 * Display Control widget works and for the same reason: this is placed at
 * anything from a 170x120 corner tile to half a wall, and a fixed 26px number
 * with an 11px unit under it is unreadable at one end and lost at the other.
 *
 * Content drops in this order as the box shrinks: the heading, then the unit
 * word under each number, then the name of what is running, then the words
 * on the running timer's buttons, then the two minute buttons. Nothing is
 * drawn under `MIN_TYPE`: a word that small cannot be read from a kitchen, so
 * it goes instead.
 */

export interface QuickTimerBox {
  w: number;
  h: number;
  /** How many preset buttons are being drawn. */
  presets: number;
  /** A session is running, so the box holds a countdown instead of the grid. */
  running: boolean;
  /**
   * The box draws its own "Quick timer" heading. False when the Title
   * setting says "No title" or the card has a title of its own, and the
   * heading's line goes to the rest of the box. Omitted = drawn.
   */
  heading?: boolean;
  /**
   * The card's Text size as a factor (1 = what the module shows on its own).
   *
   * Applied to every type size, and each stops at the room its own part of
   * the box has: 150% in a box whose numbers already fill their buttons makes
   * the smaller words bigger and leaves the numbers, where letting them grow
   * anyway put the unit on the row below and the name on the buttons.
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
  /** Height of one row of controls, and the type in it. */
  ctrlH: number;
  ctrl: number;
  /** How the running timer's buttons are laid out: four across, two by two, or two. */
  ctrlCols: number;
  ctrlRows: number;
  /** The buttons carry their words; false leaves the icon alone in a narrow one. */
  ctrlWords: boolean;
  /** The minute buttons are drawn; false in a box with room for Pause and Stop only. */
  nudges: boolean;
  /** Progress bar thickness; 0 when there is no room for it. */
  bar: number;
  /** Icon box inside a control button. */
  ctrlIcon: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Line height of the name under the countdown, which the module draws with. */
export const NAME_LINE = 1.25;
/** Line height of the heading and of the unit word. */
const WORD_LINE = 1.3;
/** The smallest type the box draws; a word that would be smaller is dropped. */
export const MIN_TYPE = 11;
/** A finger's width. Buttons are kept at least this tall wherever the box allows. */
const FINGER = 44;

/** Box assumed before the first measurement, and in jsdom, which reports zero. */
const UNMEASURED = { w: 308, h: 168 };

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
  const type = box.textScale && box.textScale > 0 ? box.textScale : 1;

  // The card's own padding is the module's padding (ModuleWrapper measures
  // outside this), so the measured box is already the room there is.
  const innerW = w;
  // The heading is the first thing to go: in a corner tile the presets say
  // what this is better than a word over them would.
  const head = box.heading !== false && h >= 110 && innerW >= 120 ? clamp(h * 0.068, MIN_TYPE, 16) * type : 0;
  const innerH = Math.max(0, h - (head ? head * WORD_LINE + gap : 0));

  if (box.running) {
    // Four buttons across where each gets a finger's width and a bit; two by
    // two in a tall strip; otherwise Pause and Stop alone, which are the two
    // a hand goes for, rather than four slivers nobody can hit.
    const wide = innerW >= 4 * 60 + 3 * gap;
    const tall = !wide && innerH >= 250;
    const ctrlCols = wide ? 4 : 2;
    const ctrlRows = tall ? 2 : 1;
    const nudges = wide || tall;
    const ctrlH = ctrlRows === 2
      ? clamp(innerH * 0.14, FINGER, 72)
      : clamp(innerH * 0.3, Math.min(FINGER, innerH * 0.42), 72);
    const ctrlBlock = ctrlH * ctrlRows + gap * (ctrlRows - 1);
    const ctrlW = (innerW - gap * (ctrlCols - 1)) / ctrlCols;

    const bar = innerH >= 92 ? clamp(innerH * 0.05, 4, 8) : 0;
    const rest = Math.max(0, innerH - ctrlBlock - gap - (bar ? bar + gap : 0));
    // The name takes its line and the gap above it. It goes when the
    // countdown would be left with too little, at any text size.
    let name = rest >= 54 && innerW >= 120 ? clamp(rest * 0.17, MIN_TYPE, 18) * type : 0;
    if (name && rest - (name * NAME_LINE + gap) < 26) name = 0;
    const timeRoom = rest - (name ? name * NAME_LINE + gap : 0);
    const ctrl = Math.min(clamp(ctrlH * 0.32, MIN_TYPE, 20) * type, ctrlH * 0.42);
    const ctrlIcon = clamp(ctrlH * 0.34, 12, 24);
    return {
      gap, radius, cols: 1, rows: 1, head, number: 0, unit: 0,
      // "10:00" is about 2.8 of its own type size wide.
      time: Math.max(12, Math.min(clamp(Math.min(innerW / 4.2, timeRoom), 15, 160) * type, innerW / 2.9, timeRoom)),
      name,
      ctrlH,
      ctrl,
      ctrlCols,
      ctrlRows,
      // An icon, a gap and the longest word ("Resume") at this size.
      ctrlWords: ctrlW >= ctrlIcon + ctrl * 5.2,
      nudges,
      bar,
      ctrlIcon,
    };
  }

  const aspect = innerH > 0 ? innerW / innerH : 1;
  const [cols, rows] = presetShape(presets, aspect);
  const bw = (innerW - gap * (cols - 1)) / cols;
  const bh = (innerH - gap * (rows - 1)) / rows;

  // What a button has for its number and unit together, clear of its edges.
  const room = bh * 0.9;
  let unit = bh >= 64 && bw >= 44 ? clamp(bh * 0.14, MIN_TYPE, 20) * type : 0;
  if (unit && room - unit * 1.5 < 20) unit = 0;
  const numberRoom = room - (unit ? unit * 1.5 : 0);
  return {
    gap, radius, cols, rows, head,
    // Two digits have to fit across the button, so the width share is the one
    // that binds on a narrow tile. The ceiling is high on purpose: this is
    // placed at half a wall as readily as in a corner, and a 54px "10" in a
    // 330x198 button reads as a mistake.
    number: Math.max(MIN_TYPE, Math.min(clamp(Math.min(bw / 2.3, numberRoom * 0.87), MIN_TYPE, 140) * type, bw / 1.45, numberRoom)),
    unit,
    time: 0, name: 0, ctrlH: 0, ctrl: 0, ctrlCols: 0, ctrlRows: 0, ctrlWords: false, nudges: false, bar: 0, ctrlIcon: 0,
  };
}

export interface QuickTimerFinishedMetrics {
  /** "Time's up!" */
  big: number;
  /** The timer's name and the "Tap to close" line under it. */
  small: number;
  /** There is room for the name under the words. */
  name: boolean;
  /** There is room for "Tap to close" under the name. */
  hint: boolean;
}

/**
 * Sizes for "Time's up!" filling the box. The words stay on one line and
 * inside the box at any Text size; the two lines under them appear only
 * where there is height left for them.
 */
export function quickTimerFinishedMetrics(box: { w: number; h: number; textScale?: number }): QuickTimerFinishedMetrics {
  const w = box.w > 0 ? box.w : UNMEASURED.w;
  const h = box.h > 0 ? box.h : UNMEASURED.h;
  const type = box.textScale && box.textScale > 0 ? box.textScale : 1;
  // "Time's up!" is about 5 of its own type size wide, and longer in other
  // languages ("Die Zeit ist um!"), so the width share leaves room for that.
  const big = Math.max(MIN_TYPE, Math.min(Math.min(w / 6.2, Math.max(14, h * 0.3)) * type, w / 7, h * 0.5));
  const small = Math.max(MIN_TYPE, big * 0.34);
  const line = small * 1.45;
  const name = h >= big * 1.2 + line + 12;
  const hint = name && h >= big * 1.2 + line * 2 + 16;
  return { big, small, name, hint };
}
