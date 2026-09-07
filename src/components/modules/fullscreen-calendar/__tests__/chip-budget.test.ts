import { describe, it, expect } from 'vitest';
import { fitChips } from '../chip-budget';

describe('fitChips', () => {
  it('shows everything when it all fits', () => {
    expect(fitChips({ chipHeights: [30, 30, 30], budgetH: 100, gap: 4, moreH: 12 }))
      .toEqual({ visible: 3, hidden: 0, cornerBadge: false });
  });

  it('charges only the chips that are taller, so plain chips still fit next to a described one', () => {
    // Uniform tall rate (49 each) would fit only two of four in 135px; real
    // heights fit three plus the +N line.
    const plain = 30;
    const described = 49;
    const budget = fitChips({ chipHeights: [described, plain, plain, plain], budgetH: 135, gap: 4, moreH: 12 });
    expect(budget).toEqual({ visible: 3, hidden: 1, cornerBadge: false });
  });

  it('gives back a chip so the +N line has room', () => {
    // Three chips fill the budget exactly; hiding the fourth needs the +N line.
    expect(fitChips({ chipHeights: [30, 30, 30, 30], budgetH: 98, gap: 4, moreH: 12 }))
      .toEqual({ visible: 2, hidden: 2, cornerBadge: false });
  });

  it('keeps the first chip and rides the +N on the corner when nothing else fits', () => {
    expect(fitChips({ chipHeights: [30, 30], budgetH: 32, gap: 4, moreH: 12 }))
      .toEqual({ visible: 1, hidden: 1, cornerBadge: true });
    // Even when the first chip alone overflows the budget.
    expect(fitChips({ chipHeights: [40, 30], budgetH: 20, gap: 4, moreH: 12 }))
      .toEqual({ visible: 1, hidden: 1, cornerBadge: true });
  });

  it('handles an empty cell', () => {
    expect(fitChips({ chipHeights: [], budgetH: 100, gap: 4, moreH: 12 }))
      .toEqual({ visible: 0, hidden: 0, cornerBadge: false });
  });
});
