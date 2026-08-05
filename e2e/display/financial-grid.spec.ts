import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import type { ModuleInstance } from '@/types/config';

/**
 * Cards-view layout contract for the shared financial views
 * (src/components/modules/financial/shared.tsx → FinancialCardsView).
 *
 * The view lays cards out on equal grid tracks
 * (`repeat(auto-fit, minmax(Nem, 1fr))`) precisely so cards that wrap onto a
 * second row line up with the cards above them. The flex-wrap layout it
 * replaced sized every card to its own content and centred a short final row,
 * so a 5-symbol wrap produced ragged columns — which is what these bounding-box
 * assertions pin down. Stock-ticker and crypto render through the same
 * component, so one surface covers both.
 *
 * The payload is stubbed per-spec rather than by extending the shared
 * stocks.json fixture: five symbols with deliberately different price widths
 * are what makes the assertion discriminating (equal tracks vs content-sized
 * boxes), and the shared fixture's two-symbol shape is asserted elsewhere.
 */

/** Five symbols — a prime count, so the last row is short for any column count
 *  from 2 to 4, and prices of visibly different widths so content-sized cards
 *  could never accidentally line up.
 *
 *  AAPL deliberately arrives without a sparkline (the field is optional on the
 *  upstream shape, and a symbol whose history is unavailable really does come
 *  back bare). That makes its card's NATURAL height shorter than its row
 *  neighbours', which is what gives the stretch/centring assertions something
 *  to detect — with five identical card shapes they would hold under any
 *  layout. */
const FIVE_STOCKS = {
  stocks: [
    { symbol: 'F', price: 9.87, change: 0.12, changePercent: 1.23, sparkline: [9.7, 9.8, 9.75, 9.9, 9.87] },
    { symbol: 'AAPL', price: 150.25, change: 1.23, changePercent: 0.55 },
    { symbol: 'GOOGL', price: 2875.5, change: -12.4, changePercent: -0.43, sparkline: [2890.0, 2884.2, 2879.9, 2876.4, 2875.5] },
    { symbol: 'MSFT', price: 402.1, change: -2.4, changePercent: -0.59, sparkline: [404.5, 403.8, 404.1, 403.0, 402.1] },
    { symbol: 'NVDA', price: 1180.4, change: 24.6, changePercent: 2.13, sparkline: [1150.2, 1162.8, 1171.4, 1176.9, 1180.4] },
  ],
};

/** A cards-view stock ticker wide enough to fit several columns but not all
 *  five, so the symbols wrap. */
function cardsTicker(): ModuleInstance {
  return {
    ...buildModuleInstance('stock-ticker', { view: 'cards', symbols: 'F,AAPL,GOOGL,MSFT,NVDA' }),
    position: { x: 100, y: 300 },
    size: { w: 700, h: 900 },
  };
}

/** A rendered FinancialCard, addressed by its own content (every card holds a
 *  tabular-nums price span) rather than by the container's layout classes — so
 *  these assertions measure geometry and would still find the cards under any
 *  other layout technique, including the flex-wrap one this replaced. */
const CARD = 'div:has(> span.tabular-nums)';

interface Box { x: number; y: number; width: number; height: number }

/** Group card boxes into visual rows by their top edge (1px tolerance for
 *  sub-pixel layout), preserving left-to-right order within each row. */
function toRows(boxes: Box[]): Box[][] {
  const rows: Box[][] = [];
  for (const box of [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r[0].y - box.y) <= 1);
    if (row) row.push(box);
    else rows.push([box]);
  }
  return rows;
}

test('cards view keeps wrapped cards on shared grid columns', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { stocks: FIVE_STOCKS } });
  const display = await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [cardsTicker()])],
    settings: matrixSettings(),
  }));

  const mod = display.module('stock-ticker');
  const cards = mod.locator(CARD);
  await expect(cards).toHaveCount(5);

  const boxes = (await cards.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  )) as Box[];

  const rows = toRows(boxes);
  // Premise of the test: the symbols actually wrapped, and the final row is
  // short (the case flex-wrap centred and grid does not). If a layout change
  // ever fits all five on one row this fails here rather than passing empty.
  expect(rows.length).toBeGreaterThan(1);
  expect(rows[rows.length - 1].length).toBeLessThan(rows[0].length);

  // Every wrapped card sits on the column its row-1 counterpart established:
  // same left edge, same track width.
  for (const row of rows.slice(1)) {
    row.forEach((card, col) => {
      expect(Math.abs(card.x - rows[0][col].x)).toBeLessThanOrEqual(2);
      expect(Math.abs(card.width - rows[0][col].width)).toBeLessThanOrEqual(2);
    });
  }

  // Tracks are uniform, not merely aligned: a card's neighbour is one full
  // column-plus-gap to its right.
  const pitch = rows[0][1].x - rows[0][0].x;
  for (const row of rows) {
    row.forEach((card, col) => {
      expect(Math.abs(card.x - (rows[0][0].x + col * pitch))).toBeLessThanOrEqual(2);
    });
  }
});

test('cards view stretches a row to one height and centres each card in it', async ({ page, request }) => {
  // Grid items stretch to their row, so the sparkline-less AAPL card matches
  // the height and top edge of its taller neighbours instead of being
  // vertically centred at its own natural size (what flex-wrap did), and its
  // content sits in the middle of the stretched box rather than at the top.
  await stubModuleData(page, { overrides: { stocks: FIVE_STOCKS } });
  const display = await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [cardsTicker()])],
    settings: matrixSettings(),
  }));

  const cards = display.module('stock-ticker').locator(CARD);
  await expect(cards).toHaveCount(5);
  // Premise: card 0 (F) draws a sparkline and card 1 (AAPL) does not, so their
  // natural heights differ. Cards render in payload order, and the first two
  // always share the top row.
  await expect(cards.nth(0).locator('svg.financial-sparkline')).toHaveCount(1);
  await expect(cards.nth(1).locator('svg.financial-sparkline')).toHaveCount(0);

  const measured = await cards.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const first = el.firstElementChild!.getBoundingClientRect();
      const last = el.lastElementChild!.getBoundingClientRect();
      return {
        x: r.x, y: r.y, width: r.width, height: r.height,
        // Slack above the first child and below the last child: equal only when
        // the content block is centred inside the (stretched) card.
        headroom: first.top - r.top,
        legroom: r.bottom - last.bottom,
      };
    }),
  );
  const [tall, short] = measured;
  expect(short.x).toBeGreaterThan(tall.x); // side by side, same row

  // Stretched: the shorter card takes its neighbour's full height and top edge
  // instead of shrink-wrapping its content and floating in the middle.
  expect(Math.abs(short.y - tall.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(short.height - tall.height)).toBeLessThanOrEqual(2);

  // Centred: the extra height is split above and below the content, not dumped
  // underneath it.
  for (const card of measured) {
    expect(Math.abs(card.headroom - card.legroom)).toBeLessThanOrEqual(2);
  }
});
