import { describe, it, expect } from 'vitest';
import {
  cardMetrics,
  cardContentHeight,
  fitStore,
  hiddenBelow,
  nameFits,
  pickColumns,
  CARD_NAME_PX,
  CARD_NAME_FLOOR_PX,
  PILL_MIN_PX,
} from '../rewards/storeLayout';

const REWARDS = [
  { name: 'Movie night', description: 'Pick the movie' },
  { name: 'Ice cream' },
  { name: '30 minutes of screen time', description: 'After homework' },
  { name: 'Stay up late' },
  { name: 'Pick dinner' },
  { name: 'A really long reward name that keeps going and going', description: 'With a description that is also rather long and wordy' },
];

const base = { rewards: REWARDS, moreStripHeight: 50, feedCount: 0, k: 1, t: 1, d: 1.2 };

describe('pickColumns', () => {
  it('uses two columns in portrait up to six rewards, then three', () => {
    expect(pickColumns(1, false)).toBe(2);
    expect(pickColumns(6, false)).toBe(2);
    expect(pickColumns(7, false)).toBe(3);
  });

  it('uses between two and four columns in landscape from the count', () => {
    expect(pickColumns(1, true)).toBe(2);
    expect(pickColumns(3, true)).toBe(2);
    expect(pickColumns(6, true)).toBe(3);
    expect(pickColumns(12, true)).toBe(4);
  });
});

describe('cardMetrics', () => {
  it('authors the card name at 30px times t and the pill at least 56k tall', () => {
    const m = cardMetrics(1, 1, 1);
    expect(m.name).toBe(CARD_NAME_PX);
    expect(m.pill).toBeGreaterThanOrEqual(PILL_MIN_PX);
    const big = cardMetrics(1, 2.15, 1);
    expect(big.name).toBeCloseTo(CARD_NAME_PX * 2.15);
    const small = cardMetrics(720 / 1080, 720 / 1080, 1);
    expect(small.pill).toBeCloseTo(PILL_MIN_PX * (720 / 1080));
  });

  it('scales paddings with density but not text', () => {
    const cozy = cardMetrics(1, 1, 1.2);
    const snug = cardMetrics(1, 1, 1);
    expect(cozy.padX).toBeGreaterThan(snug.padX);
    expect(cozy.name).toBe(snug.name);
  });
});

describe('fitStore', () => {
  it('fits six rewards in a 1080x1920 portrait panel at the authored size', () => {
    const fit = fitStore({ ...base, availWidth: 1000, availHeight: 1470, isLandscape: false });
    expect(fit.columns).toBe(2);
    expect(fit.rows).toBe(3);
    expect(fit.overflow).toBe(false);
    expect(fit.metrics.s).toBe(1);
    expect(fit.rows * fit.rowHeight + (fit.rows - 1) * fit.gap).toBeLessThanOrEqual(1470 + 0.01);
  });

  it('fits six rewards in a 1920x1080 landscape panel', () => {
    const fit = fitStore({ ...base, availWidth: 1840, availHeight: 740, isLandscape: true });
    expect(fit.columns).toBe(3);
    expect(fit.rows).toBe(2);
    expect(fit.overflow).toBe(false);
    expect(fit.rows * fit.rowHeight + (fit.rows - 1) * fit.gap).toBeLessThanOrEqual(740 + 0.01);
  });

  it('shrinks the cards before it lets the grid overflow, never below the name floor', () => {
    const fit = fitStore({ ...base, t: 2.15, availWidth: 1840, availHeight: 740, isLandscape: true });
    expect(fit.overflow).toBe(false);
    expect(fit.metrics.s).toBeLessThan(1);
    expect(fit.metrics.name).toBeGreaterThanOrEqual(CARD_NAME_FLOOR_PX - 0.01);
  });

  it('keeps two portrait columns at 4x-large rather than cutting names off in three', () => {
    const fit = fitStore({ ...base, t: 2.15, availWidth: 1000, availHeight: 1500, isLandscape: false });
    expect(fit.overflow).toBe(false);
    expect(fit.columns).toBe(2);
    expect(fit.rows).toBe(3);
    expect(fit.metrics.name).toBeGreaterThan(CARD_NAME_PX);
    REWARDS.forEach((r) => expect(nameFits(r, fit.metrics, (1000 - fit.gap) / 2 - 2 * fit.metrics.padX)).toBe(true));
  });

  it('adds a column when that keeps the text larger than shrinking would', () => {
    const short = REWARDS.map((r) => ({ ...r, name: r.name.slice(0, 12) }));
    const fit = fitStore({ ...base, rewards: short, t: 2.15, availWidth: 1000, availHeight: 1500, isLandscape: false });
    expect(fit.overflow).toBe(false);
    expect(fit.columns).toBe(3);
    expect(fit.rows).toBe(2);
    expect(fit.metrics.name).toBeGreaterThan(50);
  });

  it('overflows with whole rows on screen when nothing else works', () => {
    const fit = fitStore({ ...base, t: 2.15, availWidth: 1840, availHeight: 500, isLandscape: true });
    expect(fit.overflow).toBe(true);
    expect(fit.visibleRows).toBeGreaterThanOrEqual(1);
    expect(fit.visibleRows).toBeLessThan(fit.rows);
    const shown = fit.visibleRows * fit.rowHeight + (fit.visibleRows - 1) * fit.gap;
    expect(shown).toBeLessThanOrEqual(500 - base.moreStripHeight + 0.01);
    expect(hiddenBelow(REWARDS.length, fit, 0, 500 - base.moreStripHeight)).toBe(REWARDS.length - fit.visibleRows * fit.columns);
    expect(hiddenBelow(REWARDS.length, fit, 10_000, 500)).toBe(0);
  });

  it('gives the feed the height the grid leaves over, up to ten rows', () => {
    const roomy = fitStore({ ...base, feedCount: 12, availWidth: 1000, availHeight: 1900, isLandscape: false });
    expect(roomy.feedRows).toBeGreaterThan(0);
    expect(roomy.feedRows).toBeLessThanOrEqual(10);
    expect(roomy.rows * roomy.rowHeight + (roomy.rows - 1) * roomy.gap + roomy.feedHeight).toBeLessThanOrEqual(1900 + 0.01);
    const tight = fitStore({ ...base, feedCount: 12, availWidth: 1840, availHeight: 700, isLandscape: true });
    expect(tight.feedRows).toBe(0);
    expect(tight.feedHeight).toBe(0);
  });

  it('lets cards grow a little when there is headroom, but keeps the rest', () => {
    const fit = fitStore({ ...base, rewards: REWARDS.slice(0, 2), availWidth: 1000, availHeight: 1500, isLandscape: false });
    const m = fit.metrics;
    const content = Math.max(...REWARDS.slice(0, 2).map((r) => cardContentHeight(r, m, 490 - 2 * m.padX)));
    expect(fit.rowHeight).toBeGreaterThanOrEqual(content);
    expect(fit.rowHeight).toBeLessThanOrEqual(content * 1.25 + 0.01);
  });

  it('draws at the authored size before the scroller is measured', () => {
    const fit = fitStore({ ...base, availWidth: 0, availHeight: 0, isLandscape: false });
    expect(fit.metrics.s).toBe(1);
    expect(fit.overflow).toBe(false);
  });
});
