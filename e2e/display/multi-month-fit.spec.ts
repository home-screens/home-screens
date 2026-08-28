import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * The multi-month grid is sized entirely in ems, so its footprint is
 * monthCount x six week rows of a font that knows nothing about the box it has
 * to fit in. Six months side by side used to run each month's seven columns
 * straight through its neighbour, and six stacked months ran their rows into
 * each other; the module scales its font down to fit instead.
 *
 * A week row whose tracks need more space than the row has is exactly the
 * failure, so that is what gets asserted — per row, on both axes, rather than
 * on the module box, which an `overflow: hidden` ancestor would hide.
 */
interface FitCase {
  name: string;
  config: Record<string, unknown>;
  size: { w: number; h: number };
}

const CASES: FitCase[] = [
  { name: 'vertical · default size', config: { view: 'vertical', monthCount: 3 }, size: { w: 400, h: 700 } },
  { name: 'vertical · six months in one default box', config: { view: 'vertical', monthCount: 6 }, size: { w: 400, h: 700 } },
  { name: 'horizontal · three months', config: { view: 'horizontal', monthCount: 3 }, size: { w: 1040, h: 340 } },
  { name: 'horizontal · six months', config: { view: 'horizontal', monthCount: 6 }, size: { w: 1040, h: 340 } },
  { name: 'horizontal · six months with week numbers', config: { view: 'horizontal', monthCount: 6, showWeekNumbers: true }, size: { w: 1040, h: 340 } },
  { name: 'horizontal · two months in a small box', config: { view: 'horizontal', monthCount: 2 }, size: { w: 500, h: 260 } },
];

for (const c of CASES) {
  test(`multi-month fits its box · ${c.name}`, async ({ page, request }) => {
    const mod = buildModuleInstance('multi-month', c.config);
    mod.position = { x: 20, y: 20 };
    mod.size = { w: c.size.w, h: c.size.h };
    await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [mod])],
    }));

    const mm = page.locator('[data-module-type="multi-month"]').first();
    await expect(mm).toBeVisible();

    // The fit measures and corrects across a few frames, so poll rather than
    // asserting on the first paint.
    await expect.poll(async () => mm.evaluate((el) => {
      // Nothing inside the module may need more room than it has: a month
      // block wider than its column is six months colliding, a week row taller
      // than its track is two rows of digits colliding. 1px of slack for
      // sub-pixel rounding.
      const parts = Array.from(el.querySelectorAll<HTMLElement>('div'));
      return parts
        .filter((p) => p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1)
        .map((p) => `${p.className || 'inline'} ${p.scrollWidth}x${p.scrollHeight} in ${p.clientWidth}x${p.clientHeight}`);
    }), `${c.name}: something inside the module does not fit`).toEqual([]);

    // Collapsed rows aside, the module must still have drawn its full grid.
    const cellCount = await mm.evaluate((el) => el.querySelectorAll('div[style*="border-radius:50%"]').length);
    expect(cellCount).toBe(42 * (c.config.monthCount as number));
  });
}
