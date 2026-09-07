/**
 * How many event chips fit in a family-grid cell.
 *
 * The grid never scrolls, so a cell that cannot show everything folds the
 * rest into a "+N" line. Chips are not all the same height once descriptions
 * are on: only an event that actually has one grows, and by however many
 * lines its text needs (up to the clamp). Charging every chip the tall rate
 * hid events that would have fit, so the fit is greedy over real heights.
 */

export interface ChipBudgetInput {
  /** Per-chip heights, in order, already including any description lines. */
  chipHeights: number[];
  /** Cell height minus padding. */
  budgetH: number;
  /** Vertical gap between chips. */
  gap: number;
  /** Height of the "+N" line that follows the last visible chip. */
  moreH: number;
}

export interface ChipBudget {
  /** How many chips draw, from the top. Always at least one when the cell has any. */
  visible: number;
  /** Chips folded into "+N". */
  hidden: number;
  /** The "+N" cannot fit under the one chip that shows, so it rides the cell's corner. */
  cornerBadge: boolean;
}

export function fitChips({ chipHeights, budgetH, gap, moreH }: ChipBudgetInput): ChipBudget {
  const total = chipHeights.length;
  if (total === 0) return { visible: 0, hidden: 0, cornerBadge: false };

  // Greedy: take chips while they fit.
  let used = 0;
  let visible = 0;
  for (const h of chipHeights) {
    const next = used + (visible > 0 ? gap : 0) + h;
    if (next > budgetH) break;
    used = next;
    visible += 1;
  }
  if (visible === total) return { visible, hidden: 0, cornerBadge: false };

  // The first chip always shows, even into an overflowing cell: an empty
  // cell with a "+3" reads as nothing on, not as three things.
  if (visible === 0) {
    visible = 1;
    used = chipHeights[0];
  }

  // Something is hidden, so the "+N" line needs room too: give back chips
  // from the bottom until it fits, but never the first one.
  while (visible > 1 && used + gap + moreH > budgetH) {
    visible -= 1;
    used = chipHeights.slice(0, visible).reduce((sum, h, i) => sum + h + (i > 0 ? gap : 0), 0);
  }
  const hidden = total - visible;
  const cornerBadge = visible === 1 && used + gap + moreH > budgetH;
  return { visible, hidden, cornerBadge };
}
