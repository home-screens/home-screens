// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { installResizeObserverStub } from './helpers/harness';
import enUSModules from '@/translations/en-US/modules.json';
import { DEFAULT_MODULE_STYLE, type MultiMonthConfig, type ModuleStyle, type WeekStartDay } from '@/types/config';
import MultiMonthModule, { getMonthGrid, WEEKS_PER_GRID } from '../MultiMonthModule';

const START_DAYS: WeekStartDay[] = ['sunday', 'monday'];

function daysIn(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function expectedOffset(year: number, month: number, startDay: WeekStartDay) {
  const dow = new Date(year, month, 1).getDay();
  return startDay === 'monday' ? (dow === 0 ? 6 : dow - 1) : dow;
}

describe('getMonthGrid', () => {
  it('always returns a full six-week grid', () => {
    // The whole point of the fixed grid: the DOM shape cannot depend on the
    // date, or a display hydrating across a month boundary changes its child
    // count and React throws.
    for (const startDay of START_DAYS) {
      for (let year = 2024; year <= 2034; year++) {
        for (let month = 0; month < 12; month++) {
          const cells = getMonthGrid(year, month, startDay);
          expect(cells, `${year}-${month + 1} ${startDay}`).toHaveLength(WEEKS_PER_GRID * 7);
        }
      }
    }
  });

  it('keeps the leading offset and the current-month run intact', () => {
    for (const startDay of START_DAYS) {
      for (let month = 0; month < 12; month++) {
        const cells = getMonthGrid(2026, month, startDay);
        const offset = expectedOffset(2026, month, startDay);
        const firstCurrent = cells.findIndex((c) => c.current);
        const current = cells.filter((c) => c.current);

        expect(firstCurrent, `${month + 1} ${startDay} offset`).toBe(offset);
        expect(current.map((c) => c.day)).toEqual(
          Array.from({ length: daysIn(2026, month) }, (_, i) => i + 1),
        );
        // Contiguous: no current-month day appears after the padding starts.
        const lastCurrent = cells.map((c) => c.current).lastIndexOf(true);
        expect(lastCurrent - firstCurrent + 1).toBe(current.length);
      }
    }
  });

  it('numbers leading padding from the previous month and trailing padding from 1', () => {
    // December 2026 -> the trailing cells are January 2027 days, so the ISO
    // week lookup has to roll the year as well as the month.
    const dec = getMonthGrid(2026, 11, 'sunday');
    const trailing = dec.slice(dec.map((c) => c.current).lastIndexOf(true) + 1);
    expect(trailing.map((c) => c.day)).toEqual(
      Array.from({ length: trailing.length }, (_, i) => i + 1),
    );

    // March 2026 starts mid-week, so the leading cells count back from the end
    // of February.
    const mar = getMonthGrid(2026, 2, 'sunday');
    const offset = expectedOffset(2026, 2, 'sunday');
    expect(mar.slice(0, offset).map((c) => c.day)).toEqual([22, 23, 24, 25, 26, 27, 28].slice(7 - offset));
  });

  it('pads the short and long edge months to the same shape', () => {
    // February 2026 starts exactly on a Sunday: the only four-week month in a
    // decade, and the largest amount of padding the grid ever adds.
    const feb = getMonthGrid(2026, 1, 'sunday');
    expect(feb.filter((c) => c.current)).toHaveLength(28);
    expect(feb.slice(28).map((c) => c.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

    // May 2026 naturally spans six weeks, so it gains no padding row at all:
    // its trailing filler stays inside the sixth week.
    const may = getMonthGrid(2026, 4, 'sunday');
    const mayTrailing = may.length - (may.map((c) => c.current).lastIndexOf(true) + 1);
    expect(mayTrailing).toBeLessThan(7);
  });

  it('never pads past the following month', () => {
    // The week-number column resolves a padded row by assuming its days belong
    // to month + 1. That holds only while the padding stays under the shortest
    // possible next month (28 days).
    for (const startDay of START_DAYS) {
      for (let year = 2024; year <= 2034; year++) {
        for (let month = 0; month < 12; month++) {
          const cells = getMonthGrid(year, month, startDay);
          const trailing = cells.length - (cells.map((c) => c.current).lastIndexOf(true) + 1);
          expect(trailing, `${year}-${month + 1} ${startDay}`).toBeLessThanOrEqual(14);
        }
      }
    }
  });
});

// The module measures itself to fit its box; jsdom ships no ResizeObserver.
installResizeObserverStub();

const clock = vi.hoisted(() => ({ now: new Date(0) }));
vi.mock('@/hooks/useTZClock', () => ({
  useTZClock: () => clock.now,
}));

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function renderModule(now: Date, overrides: Partial<MultiMonthConfig> = {}) {
  clock.now = now;
  const config = {
    view: 'vertical',
    monthCount: 1,
    startDay: 'sunday',
    showWeekNumbers: false,
    highlightWeekends: true,
    showAdjacentDays: true,
    ...overrides,
  } as MultiMonthConfig;
  return render(<Wrapper><MultiMonthModule config={config} style={style} /></Wrapper>);
}

/** jsdom expands the `flex: 1` shorthand to its longhand triple. */
const FULL = '1 1 0%';

/** The day rows are the grid children that hold seven day cells. */
function dayRows(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('div[style*="grid-template-columns"]'))
    .filter((el) => el.querySelector('div > div[style*="border-radius: 50%"]'));
}

describe('MultiMonthModule rows', () => {
  afterEach(cleanup);

  it('renders six day rows regardless of the month', () => {
    // Feb 2026 (4 natural weeks) and May 2026 (6) have to agree, or the
    // hydration mismatch is back.
    for (const date of [new Date(2026, 1, 15), new Date(2026, 4, 15), new Date(2026, 7, 27)]) {
      const { container, unmount } = renderModule(date);
      expect(dayRows(container), date.toDateString()).toHaveLength(WEEKS_PER_GRID);
      unmount();
    }
  });

  it('collapses all-adjacent rows when adjacent days are hidden', () => {
    const { container } = renderModule(new Date(2026, 1, 15), { showAdjacentDays: false });
    const rows = dayRows(container);
    expect(rows).toHaveLength(WEEKS_PER_GRID);
    // February 2026 fills four rows; the last two hold nothing but March days.
    expect(rows.map((r) => r.style.flex)).toEqual([FULL, FULL, FULL, FULL, '0 0 0px', '0 0 0px']);
    expect(rows.slice(4).every((r) => r.style.overflow === 'hidden')).toBe(true);
  });

  it('keeps every row full height when adjacent days are shown', () => {
    const { container } = renderModule(new Date(2026, 1, 15));
    expect(dayRows(container).map((r) => r.style.flex)).toEqual(Array(WEEKS_PER_GRID).fill(FULL));
  });

  it('gives a padded trailing row the next month’s ISO week', () => {
    // December 2026 pads into January 2027: the last week number has to roll
    // over to 53/1 rather than repeat the previous row.
    const { container } = renderModule(new Date(2026, 11, 15), { showWeekNumbers: true });
    const weekNumbers = Array.from(container.querySelectorAll<HTMLElement>('div[style*="font-size: 0.45em"]'))
      .map((el) => Number(el.textContent));
    expect(weekNumbers).toHaveLength(WEEKS_PER_GRID);
    expect(new Set(weekNumbers).size).toBe(WEEKS_PER_GRID);
    expect(weekNumbers[WEEKS_PER_GRID - 1]).toBe(1);
  });
});
