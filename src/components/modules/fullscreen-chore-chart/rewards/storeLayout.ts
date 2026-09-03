/**
 * Layout math for the rewards store. Everything is authored in px at k = 1
 * (a 1080-wide panel at medium typography) and multiplied by `t = k * typoMul`
 * for text, `k` for chrome that must stay tappable, and `k * d` for paddings
 * and gaps. Pure functions so the fit rule is unit-testable.
 */

export const CARD_NAME_PX = 30;
export const CARD_DESC_PX = 22;
export const CARD_COST_PX = 24;
export const CARD_PILL_TEXT_PX = 24;
export const CARD_HERO_PX = 72;
export const PILL_MIN_PX = 56;
/** The card name never shrinks below this, whatever the panel. */
export const CARD_NAME_FLOOR_PX = 20;
/** Cards may grow past their content by this much when there is headroom. */
export const CARD_STRETCH_MAX = 1.1;

export const FEED_HEADING_PX = 22;
export const FEED_ROW_PX = 24;
export const FEED_TIME_PX = 20;
export const FEED_MAX_ROWS = 10;

export interface CardMetrics {
  /** Shrink applied to the t-sized text, 1 at the authored size. */
  s: number;
  name: number;
  desc: number;
  cost: number;
  pillText: number;
  hero: number;
  /** Height of the pill slot (Redeem pill or the "N more tickets" label). */
  pill: number;
  padX: number;
  padY: number;
  gap: number;
  radius: number;
  border: number;
}

export function cardMetrics(k: number, t: number, d: number, s = 1): CardMetrics {
  const ts = t * s;
  const pillText = CARD_PILL_TEXT_PX * ts;
  // Paddings follow the text down (never below two thirds) once a card is
  // drawn smaller than its medium size, so a shrunk card is not mostly air.
  const padScale = Math.min(1, Math.max(2 / 3, ts / k));
  return {
    s,
    name: CARD_NAME_PX * ts,
    desc: CARD_DESC_PX * ts,
    cost: CARD_COST_PX * ts,
    pillText,
    hero: CARD_HERO_PX * ts,
    pill: Math.max(PILL_MIN_PX * k, pillText * 1.2 + 16 * k),
    padX: 24 * k * d * padScale,
    padY: 20 * k * d * padScale,
    gap: 10 * k * d * padScale,
    radius: 20 * k,
    border: Math.max(1, 1.5 * k),
  };
}

export interface FeedMetrics {
  heading: number;
  row: number;
  time: number;
  /** Space above the heading (margin + rule). */
  top: number;
  /** Heading line plus the space under it. */
  headingBlock: number;
  /** One feed row including its vertical padding and rule. */
  rowBlock: number;
  rowPadY: number;
}

export function feedMetrics(k: number, t: number, d: number): FeedMetrics {
  const rowPadY = 10 * k * d;
  const row = FEED_ROW_PX * t;
  return {
    heading: FEED_HEADING_PX * t,
    row,
    time: FEED_TIME_PX * t,
    top: 24 * k * d + 1,
    headingBlock: FEED_HEADING_PX * t * 1.3 + 12 * k * d,
    rowBlock: row * 1.4 + rowPadY * 2 + 1,
    rowPadY,
  };
}

/** Columns from reward count and aspect: portrait 2 up to six rewards then 3, landscape 2 to 4. */
export function pickColumns(count: number, isLandscape: boolean): number {
  if (isLandscape) return Math.max(2, Math.min(4, Math.ceil(Math.max(1, count) / 2)));
  return count <= 6 ? 2 : 3;
}

export function maxColumns(isLandscape: boolean): number {
  return isLandscape ? 4 : 3;
}

/** Rough line count for `text` at `fontSize` in `width`, capped at `maxLines`. */
export function estimateLines(text: string, fontSize: number, width: number, maxLines: number): number {
  if (!text) return 0;
  const charWidth = fontSize * 0.55;
  const lines = Math.ceil((text.length * charWidth) / Math.max(1, width));
  return Math.min(maxLines, Math.max(1, lines));
}

export interface CardText {
  name: string;
  description?: string;
}

/** Names wrap to this many lines before they are cut off; descriptions get two. */
export const NAME_MAX_LINES = 3;
export const DESC_MAX_LINES = 2;

/** A name that would need more lines than it gets is cut off, so that size does not count as fitting. */
export function nameFits(reward: CardText, m: CardMetrics, innerWidth: number): boolean {
  return estimateLines(reward.name, m.name, innerWidth, Infinity) <= NAME_MAX_LINES;
}

/** The height a card needs to show everything at `m`, with names and descriptions clamped to their line caps. */
export function cardContentHeight(reward: CardText, m: CardMetrics, innerWidth: number): number {
  const nameLines = estimateLines(reward.name, m.name, innerWidth, NAME_MAX_LINES);
  const descLines = estimateLines(reward.description ?? '', m.desc, innerWidth, DESC_MAX_LINES);
  let h = m.padY * 2 + m.hero + m.gap + nameLines * m.name * 1.2;
  if (descLines > 0) h += m.gap * 0.6 + descLines * m.desc * 1.3;
  h += m.gap + m.cost * 1.2 + m.gap * 0.8 + m.pill;
  return h + m.border * 2;
}

export interface FitStoreInput {
  rewards: CardText[];
  availWidth: number;
  /** Height the grid and feed share. 0 means "not measured yet". */
  availHeight: number;
  /** Space reserved for the "+N more" strip when the grid overflows. */
  moreStripHeight: number;
  /** Feed entries available for the selected member (0 hides the feed). */
  feedCount: number;
  isLandscape: boolean;
  k: number;
  t: number;
  d: number;
}

export interface FitStoreResult {
  columns: number;
  rows: number;
  rowHeight: number;
  gap: number;
  metrics: CardMetrics;
  /** True when not every row fits even at the floor: the grid scrolls and the strip shows. */
  overflow: boolean;
  /** Rows on screen before scrolling (equals `rows` when nothing overflows). */
  visibleRows: number;
  /** Feed rows that fit under the grid. */
  feedRows: number;
  feedHeight: number;
}

function solveShrink(
  rewards: CardText[],
  k: number,
  t: number,
  d: number,
  innerWidth: number,
  rowAvail: number,
  floor: number,
): { s: number; height: number } | null {
  const needAt = (s: number) => {
    const m = cardMetrics(k, t, d, s);
    const inner = innerWidth - 2 * m.padX;
    if (!rewards.every((r) => nameFits(r, m, inner))) return Infinity;
    return Math.max(...rewards.map((r) => cardContentHeight(r, m, inner)));
  };
  if (needAt(1) <= rowAvail) return { s: 1, height: needAt(1) };
  if (needAt(floor) > rowAvail) return null;
  let lo = floor;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (needAt(mid) <= rowAvail) lo = mid;
    else hi = mid;
  }
  return { s: lo, height: needAt(lo) };
}

/**
 * Fit the reward grid to the space it has: start at the authored size, shrink
 * the cards toward the floor when `ceil(n / columns)` rows do not fit, add a
 * column before giving up, and only then let the grid scroll behind a
 * visible "+N more" strip. Whatever height the grid leaves goes to the feed.
 */
export function fitStore(input: FitStoreInput): FitStoreResult {
  const { rewards, availWidth, availHeight, moreStripHeight, feedCount, isLandscape, k, t, d } = input;
  const n = rewards.length;
  const gap = 20 * k * d;
  const floor = Math.min(1, CARD_NAME_FLOOR_PX / (CARD_NAME_PX * t));
  const feed = feedMetrics(k, t, d);
  const startCols = pickColumns(n, isLandscape);
  const maxCols = Math.max(startCols, maxColumns(isLandscape));

  const finish = (columns: number, rows: number, s: number, contentHeight: number, gridAvail: number): FitStoreResult => {
    const metrics = cardMetrics(k, t, d, s);
    const gridAtCap = rows * contentHeight + (rows - 1) * gap;
    const leftover = Math.max(0, gridAvail - gridAtCap);
    let feedRows = 0;
    if (feedCount > 0 && leftover >= feed.top + feed.headingBlock + feed.rowBlock) {
      feedRows = Math.min(feedCount, FEED_MAX_ROWS, Math.floor((leftover - feed.top - feed.headingBlock) / feed.rowBlock));
    }
    const feedHeight = feedRows > 0 ? feed.top + feed.headingBlock + feedRows * feed.rowBlock : 0;
    const roomForGrid = gridAvail - feedHeight - (rows - 1) * gap;
    const rowHeight = Math.max(contentHeight, Math.min(contentHeight * CARD_STRETCH_MAX, roomForGrid / rows));
    return { columns, rows, rowHeight, gap, metrics, overflow: false, visibleRows: rows, feedRows, feedHeight };
  };

  // Unmeasured: draw at the authored size and let the observer correct it.
  if (availHeight <= 0 || n === 0) {
    const columns = startCols;
    const rows = Math.max(1, Math.ceil(n / columns));
    const metrics = cardMetrics(k, t, d, 1);
    const colW = (availWidth - (columns - 1) * gap) / columns;
    const height = n > 0 ? Math.max(...rewards.map((r) => cardContentHeight(r, metrics, colW - 2 * metrics.padX))) : 0;
    return { columns, rows, rowHeight: height, gap, metrics, overflow: false, visibleRows: rows, feedRows: Math.min(feedCount, FEED_MAX_ROWS), feedHeight: 0 };
  }

  // The aspect rule wins while nothing has to shrink; once it does, the
  // column count that keeps the text largest wins (a third column at 4x-large
  // beats two columns of cards shrunk toward the floor).
  let bestFit: { columns: number; rows: number; s: number; height: number } | null = null;
  for (let columns = startCols; columns <= maxCols; columns++) {
    const rows = Math.ceil(n / columns);
    const colW = (availWidth - (columns - 1) * gap) / columns;
    const rowAvail = (availHeight - (rows - 1) * gap) / rows;
    const solved = solveShrink(rewards, k, t, d, colW, rowAvail, floor);
    if (!solved) continue;
    if (solved.s >= 1) { bestFit = { columns, rows, ...solved }; break; }
    if (!bestFit || solved.s > bestFit.s + 0.02) bestFit = { columns, rows, ...solved };
  }
  if (bestFit) return finish(bestFit.columns, bestFit.rows, bestFit.s, bestFit.height, availHeight);

  // Overflow: pick the column count that shows the most cards before scrolling.
  const gridAvail = Math.max(0, availHeight - moreStripHeight);
  let best: FitStoreResult | null = null;
  for (let columns = startCols; columns <= maxCols; columns++) {
    const rows = Math.ceil(n / columns);
    const colW = (availWidth - (columns - 1) * gap) / columns;
    const metrics = cardMetrics(k, t, d, floor);
    const floorHeight = Math.max(...rewards.map((r) => cardContentHeight(r, metrics, colW - 2 * metrics.padX)));
    const visibleRows = Math.max(1, Math.floor((gridAvail + gap) / (floorHeight + gap)));
    // Stretch the visible rows to fill the space exactly so the fold lands on a row boundary.
    const rowHeight = visibleRows > 1 || floorHeight < gridAvail
      ? Math.max(floorHeight, (gridAvail - (visibleRows - 1) * gap) / visibleRows)
      : floorHeight;
    const solved = solveShrink(rewards, k, t, d, colW, rowHeight, floor);
    const s = solved ? solved.s : floor;
    const candidate: FitStoreResult = {
      columns,
      rows,
      rowHeight,
      gap,
      metrics: cardMetrics(k, t, d, s),
      overflow: true,
      visibleRows: Math.min(rows, visibleRows),
      feedRows: Math.min(feedCount, FEED_MAX_ROWS),
      feedHeight: 0,
    };
    if (!best || candidate.visibleRows * columns > best.visibleRows * best.columns) best = candidate;
  }
  return best as FitStoreResult;
}

/** How many cards sit below the fold for a given scroll offset. */
export function hiddenBelow(count: number, fit: FitStoreResult, scrollTop: number, viewportHeight: number): number {
  if (!fit.overflow) return 0;
  const step = fit.rowHeight + fit.gap;
  // A row counts as seen once its bottom edge is inside the viewport.
  const rowsSeen = Math.max(0, Math.floor((scrollTop + viewportHeight + 1 - fit.rowHeight) / step) + 1);
  return Math.max(0, count - Math.min(count, rowsSeen * fit.columns));
}
