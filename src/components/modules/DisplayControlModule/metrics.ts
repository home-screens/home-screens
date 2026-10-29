/**
 * Sizing model for the Display Control widget.
 *
 * Every number the layouts render — padding, gaps, corner radius, icon, type,
 * slider — is derived here from the measured box. Nothing is authored at a
 * fixed wall size, because the widget is placed at anything from a 170x130
 * corner badge to a full-screen panel, and a fixed 36px icon with a 24px label
 * simply does not fit the small end (it needed roughly a quarter of a
 * 1080x1920 screen before this existed).
 *
 * Content drops in this order as the box shrinks: sub-labels, then the labels
 * themselves, then the "BRIGHTNESS 60%" caption over the slider. Config
 * `compact` still forces icons-only at any size.
 */

export interface ControlMetrics {
  /** Columns and rows the four command buttons are laid out in. */
  cols: number;
  rows: number;
  /** Padding inside the widget. */
  pad: number;
  /** Gap between buttons, and the basis for the gap inside a button. */
  gap: number;
  /** Corner radius of the buttons. */
  radius: number;
  /** Icon box, px. */
  icon: number;
  /** Label size, px (0 when the words are dropped). */
  label: number;
  /** Sub-label size, px (0 when dropped). */
  sub: number;
  showWords: boolean;
  showSubs: boolean;
  /** The "BRIGHTNESS 60%" row over the slider; a sun glyph stands in when off. */
  showCaption: boolean;
  /** The word "Controls" before the target pill. */
  showPickerPrefix: boolean;
  /** Height reserved for the target picker row (0 when hidden). */
  pickerH: number;
  /** Height reserved for the always-visible slider (panel layout only). */
  sliderH: number;
  /** Height reserved for the Brightness row that opens the slider (pad only). */
  brightRowH: number;
  /** The box one command button ends up with. */
  bw: number;
  bh: number;
  /** Slider thumb diameter and track thickness. */
  thumb: number;
  track: number;
  /** Caption type size. */
  caption: number;
  /** Target picker type size. */
  picker: number;
}

export interface ControlBox {
  /** The widget's padding box, since `pad` below is set on that same element
   *  and subtracted here; a content-box measurement would drop it twice. */
  w: number;
  h: number;
  layout: 'bar' | 'pad' | 'panel' | 'nav';
  compact: boolean;
  /** Whether the target picker row takes space. */
  showPicker: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Box assumed before the first measurement (and in unit tests, where jsdom
 *  reports zero) so the widget never paints a one-frame wrong size. */
const UNMEASURED = { panel: { w: 440, h: 320 }, pad: { w: 440, h: 320 }, bar: { w: 900, h: 96 }, nav: { w: 440, h: 220 } };

export function controlMetrics(box: ControlBox): ControlMetrics {
  const fallback = UNMEASURED[box.layout] ?? UNMEASURED.panel;
  const w = box.w > 0 ? box.w : fallback.w;
  const h = box.h > 0 ? box.h : fallback.h;
  const { layout, compact, showPicker } = box;

  const min = Math.min(w, h);
  // Deliberately tight. The buttons are the widget, so they run close to its
  // edge; wall-sized padding around small words is what made this feel
  // oversized. Everything here is an edge, not a frame.
  const pad = clamp(min * 0.022, 3, 12);
  const gap = clamp(min * 0.02, 3, 10);
  const radius = clamp(min * 0.038, 5, 16);

  const innerW = Math.max(0, w - pad * 2);
  let innerH = Math.max(0, h - pad * 2);

  const pickerH = showPicker ? clamp(h * 0.1, 22, 40) : 0;
  const sliderH = layout === 'panel' ? clamp(h * 0.13, 22, 56) : 0;
  const brightRowH = layout === 'pad' ? clamp(h * 0.13, 24, 58) : 0;
  const showCaption = sliderH >= 40;
  if (pickerH) innerH -= pickerH + gap;
  if (sliderH) innerH -= sliderH + gap;
  if (brightRowH) innerH -= brightRowH + gap;
  innerH = Math.max(0, innerH);

  const picker = clamp(pickerH * 0.36, 10, 18);

  if (layout === 'bar') {
    const cols = 5;
    const bw = (innerW - gap * (cols - 1)) / cols;
    const bh = innerH;
    const showWords = !compact && bw >= 104 && bh >= 30;
    const showSubs = showWords && bw >= 176;
    const label = showWords ? clamp(Math.min(bw / 10, bh * 0.3), 11, 22) : 0;
    return {
      cols, rows: 1, pad, gap, radius,
      icon: showWords
        ? clamp(bh * 0.62, 12, 34)
        : clamp(Math.min(bw * 0.5, bh * 0.72), 12, 40),
      label,
      sub: showSubs ? clamp(label * 0.85, 10, 18) : 0,
      showWords, showSubs, showCaption: false,
      showPickerPrefix: innerW >= 620,
      pickerH, sliderH: 0, brightRowH: 0, bw, bh,
      thumb: 0, track: 0, caption: 0, picker,
    };
  }

  if (layout === 'nav') {
    // Two buttons splitting the box along its long axis: side by side
    // normally, stacked in a properly tall one so a slim vertical strip never
    // becomes two letterbox slivers. With only two controls to place, the
    // words survive in boxes where the four-button layouts have already
    // dropped them, and the arrow grows much larger than a grid button's.
    const vertical = innerH > 0 && innerW / innerH <= 0.75;
    const [cols, rows] = vertical ? [1, 2] : [2, 1];
    const bw = (innerW - gap * (cols - 1)) / cols;
    const bh = (innerH - gap * (rows - 1)) / rows;
    const showWords = !compact && bw >= 104 && bh >= 44;
    const label = showWords ? clamp(Math.min(bw / 7, bh * 0.22), 12, 30) : 0;
    const wordsBlock = showWords ? label * 1.25 : 0;
    return {
      cols, rows, pad, gap, radius,
      icon: clamp(Math.min(bh * 0.8 - wordsBlock, bw * 0.55), 14, 160),
      label,
      sub: 0,
      showWords, showSubs: false, showCaption: false,
      showPickerPrefix: innerW >= 380,
      pickerH, sliderH: 0, brightRowH: 0, bw, bh,
      thumb: 0, track: 0, caption: 0, picker,
    };
  }

  // A very wide box gets one row of four, a very tall one gets one column,
  // so a slim strip never becomes four letterbox slivers.
  const aspect = innerH > 0 ? innerW / innerH : 1;
  const [cols, rows] = aspect >= 2.6 ? [4, 1] : aspect <= 0.42 ? [1, 4] : [2, 2];

  const bw = (innerW - gap * (cols - 1)) / cols;
  const bh = (innerH - gap * (rows - 1)) / rows;

  const showWords = !compact && bw >= 86 && bh >= 52;
  const showSubs = showWords && bw >= 128 && bh >= 84;
  const label = showWords ? clamp(Math.min(bw / 9.5, bh * 0.15), 11, 28) : 0;
  const sub = showSubs ? clamp(label * 0.78, 10, 20) : 0;
  // The icon takes whatever the words leave, so the content block fills about
  // three quarters of the button instead of floating in the middle of it.
  // This also keeps the icon size continuous across the box where the words
  // first appear.
  const wordsBlock = showWords ? label + sub + Math.max(2, label * 0.2) : 0;

  return {
    cols, rows, pad, gap, radius,
    icon: clamp(bh * 0.74 - wordsBlock, 12, Math.min(bw * 0.5, 72)),
    label,
    sub,
    showWords, showSubs, showCaption,
    showPickerPrefix: innerW >= 380,
    pickerH, sliderH, brightRowH, bw, bh,
    thumb: clamp(sliderH * 0.42, 12, 24),
    track: clamp(sliderH * 0.16, 4, 8),
    caption: clamp(sliderH * 0.26, 10, 15),
    picker,
  };
}

/**
 * The bar layout's brightness popover is a fixed-size floating card rather
 * than part of the widget's box, so it carries its own metrics instead of
 * inheriting the bar's (a slim bar would otherwise give it hairline type).
 */
export function popoverMetrics(): ControlMetrics {
  return controlMetrics({ w: 320, h: 440, layout: 'panel', compact: false, showPicker: false });
}

/**
 * Sizing model for the dock layout. A different shape from the four button
 * layouts: the dock is a centred pill with one tile per screen, as wide as its
 * screens rather than stretched to the box, so the numbers depend on the
 * screen count as much as the box.
 *
 * Words first: their row is reserved across the dock and the tile takes what
 * is left. Only when that tile would fall under `WORDS_FLOOR` do the words go,
 * and the tiles then shrink toward `TILE_FLOOR` (a finger). Past that the
 * pill scrolls along its axis rather than shrinking further.
 */
export interface DockMetrics {
  /** A tall box lays the dock down its side, names to the right of the tiles. */
  vertical: boolean;
  /** Tile side, px (tiles are square). */
  tile: number;
  /** Gap between tiles and the basis for the divider's margins. */
  gap: number;
  /** Padding inside the pill. */
  padIn: number;
  /** Padding between the box edge and the pill. */
  outer: number;
  /** Name type size, px (0 when the words are dropped). */
  label: number;
  showWords: boolean;
  /** Diameter of the "showing now" dot under (beside) the active tile. */
  marker: number;
  /** Corner radius of a tile and of the pill. */
  radius: number;
  pillRadius: number;
  /** Icon box inside a tile. */
  icon: number;
  /** The tiles do not fit along the box even at their smallest, so the pill scrolls. */
  overflow: boolean;
}

export interface DockBox {
  w: number;
  h: number;
  /** Screens in the dock. */
  count: number;
  /** Two extra tiles (Sleep, Brightness) after a divider. */
  extras: boolean;
  compact: boolean;
  /** Height the target picker row takes off the top (0 when hidden). */
  pickerH: number;
}

const DOCK_UNMEASURED = { w: 720, h: 140 };
const TILE_FLOOR = 40;
const TILE_CAP = 128;
/** Smallest tile that still carries its name. */
const WORDS_FLOOR = 52;

export function dockMetrics(box: DockBox): DockMetrics {
  const w = box.w > 0 ? box.w : DOCK_UNMEASURED.w;
  const h = Math.max(0, (box.h > 0 ? box.h : DOCK_UNMEASURED.h) - box.pickerH);
  const count = Math.max(1, box.count) + (box.extras ? 2 : 0);
  const vertical = h > 0 && w / h <= 0.75;
  const min = Math.min(w, h);
  const outer = clamp(min * 0.06, 4, 12);
  const availW = Math.max(0, w - outer * 2);
  const availH = Math.max(0, h - outer * 2);
  // Along the dock the tiles line up; across it sit the tile, the words and
  // the marker.
  const along = vertical ? availH : availW;
  const across = vertical ? availW : availH;

  const fit = (withWords: boolean) => {
    let tile = clamp(across * 0.62, TILE_FLOOR, TILE_CAP);
    if (withWords && !vertical) {
      // Reserve the words row from a first guess at the type size, then size
      // the tile to what is left.
      const guess = clamp(tile * 0.22, 11, 20);
      const padGuess = clamp(tile * 0.16, 6, 18);
      tile = clamp(across - padGuess * 2 - guess * 1.35 - clamp(tile * 0.08, 4, 7) * 2.2, TILE_FLOOR, TILE_CAP);
    }
    let gap = clamp(tile * 0.16, 4, 16);
    let padIn = clamp(tile * 0.16, 6, 18);
    const divider = (g: number) => (box.extras ? g * 2 + 1 : 0);
    const run = (t: number, g: number, p: number) => count * t + (count - 1) * g + p * 2 + divider(g);
    if (run(tile, gap, padIn) > along) {
      const shrunk = clamp((along - padIn * 2 - (count - 1) * gap - divider(gap)) / count, TILE_FLOOR, TILE_CAP);
      const shrunkGap = clamp(shrunk * 0.16, 4, 16);
      const shrunkPad = clamp(shrunk * 0.16, 6, 18);
      // Shrinking only pays when it makes the dock fit. A dock that would
      // scroll even at the floor keeps its comfortable tiles and their names
      // and scrolls, rather than scrolling small nameless tiles.
      if (run(shrunk, shrunkGap, shrunkPad) <= along + 0.5) {
        tile = shrunk;
        gap = shrunkGap;
        padIn = shrunkPad;
      }
    }
    const label = clamp(tile * 0.22, 11, 20);
    const ok = !withWords
      || (tile >= WORDS_FLOOR && (!vertical || tile + label * 7 + padIn * 2 <= across));
    const overflow = run(tile, gap, padIn) > along + 0.5;
    return { tile, gap, padIn, label, ok, overflow };
  };

  let r = box.compact ? null : fit(true);
  const showWords = r !== null && r.ok;
  if (!showWords) r = fit(false);
  const { tile, gap, padIn } = r!;
  const label = showWords ? r!.label : 0;

  return {
    vertical,
    tile,
    gap,
    padIn,
    outer,
    label,
    showWords,
    marker: clamp(tile * 0.08, 4, 7),
    radius: tile * 0.26,
    pillRadius: clamp(tile * 0.3, 10, 28),
    icon: Math.round(tile * 0.56),
    overflow: r!.overflow,
  };
}

export interface DockCapacity {
  /** Most screen tiles that fit along the box with their names. */
  withNames: number;
  /** Most screen tiles that fit at all; past this the pill scrolls. */
  iconsOnly: number;
}

const CAPACITY_CEILING = 99;

/**
 * How many screen buttons a dock of this box holds before it scrolls, with
 * and without names, so the editor can say so next to the list. Counts up
 * through the same metrics the wall draws with; the extras take their two
 * tiles off the top.
 */
export function dockCapacity(box: Omit<DockBox, 'count' | 'compact'>): DockCapacity {
  let withNames = 0;
  let iconsOnly = 0;
  for (let count = 1; count <= CAPACITY_CEILING; count += 1) {
    const m = dockMetrics({ ...box, count, compact: false });
    if (m.overflow) break;
    iconsOnly = count;
    if (m.showWords) withNames = count;
  }
  return { withNames, iconsOnly };
}
