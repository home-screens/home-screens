import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';

/**
 * The weather `current`, `compact`, `daily` and `combined` views size themselves by
 * measurement (`useFitFontSize`) rather than by a fixed height-to-font ratio.
 * Their footprint depends on which stats are enabled, how many lines a stats row
 * wraps into, and (for `daily`) how many day columns sit side by side — none of
 * which a single scale factor can express. All four used to overflow their own
 * box: `current` by 60-500px at every size, `daily` by 24-91px plus a wrapped day
 * that landed outside the box entirely, `combined` by 10px at 600x300 with a
 * location header and 18px at 600x900, `compact` by a few pixels.
 *
 * So this pins the property directly: whatever the size or config, the content
 * fits its box on both axes, and the parts that must not deform don't.
 */
const WEATHER = {
  hourly: [{
    time: '2099-07-07T12:00:00Z', temp: 72, feelsLike: 70, humidity: 55, icon: 'clear-day',
    description: 'Partly cloudy', windSpeed: 8, precipProbability: 10,
    pressure: 1013, visibility: 10, dewPoint: 55,
  }],
  // Five days, because `daily` renders `daysToShow` (5) columns side by side and
  // its width is what used to make the row wrap. Day one carries the same 78/61
  // and 10% markers the hourly entry does, so every view asserts on the same text.
  forecast: Array.from({ length: 5 }, (_, i) => ({
    date: `2099-07-${String(7 + i).padStart(2, '0')}`,
    high: 78 - i, low: 61 - i, icon: 'clear-day', description: 'Sunny',
    precipProbability: 10 + i, humidity: 55 + i, windSpeed: 8 + i, precipAmount: 0.2,
  })),
};

const ALL_STATS = {
  showHumidity: true, showWind: true, showPressure: true,
  showVisibility: true, showDewPoint: true,
};

const CASES: Array<{ name: string; size: { w: number; h: number }; config: Record<string, unknown> }> = [
  { name: 'registry default size', size: { w: 600, h: 300 }, config: {} },
  { name: 'short module', size: { w: 600, h: 200 }, config: {} },
  { name: 'tall module', size: { w: 600, h: 700 }, config: {} },
  { name: 'narrow module', size: { w: 300, h: 250 }, config: {} },
  // A wide strip: `daily` lays five day columns across it, so this is the case
  // where width, not height, is the binding constraint.
  { name: 'wide strip', size: { w: 1040, h: 260 }, config: {} },
  // A tall box does the same thing to `compact`, whose font comes off the height.
  { name: 'tall box', size: { w: 550, h: 390 }, config: { showHumidity: true, showWind: true } },
  { name: 'wide panel', size: { w: 1040, h: 460 }, config: { showHumidity: true } },
  // Every stat on: rows wrap, so the content is materially taller.
  { name: 'all stats', size: { w: 600, h: 300 }, config: ALL_STATS },
  { name: 'all stats, narrow', size: { w: 300, h: 250 }, config: ALL_STATS },
  { name: 'all stats, wide', size: { w: 1040, h: 460 }, config: ALL_STATS },
  // The location header takes height off the view box before it measures.
  { name: 'location header', size: { w: 600, h: 300 }, config: { showLocation: true } },
  { name: 'location header, all stats', size: { w: 600, h: 300 }, config: { showLocation: true, ...ALL_STATS } },
];

// Every view that measures itself must fit under every case above.
const FITTED_VIEWS = ['current', 'compact', 'daily', 'combined'] as const;

for (const view of FITTED_VIEWS) {
for (const c of CASES) {
  test(`${view} view fits its box: ${c.name}`, async ({ page, request }) => {
    await stubModuleData(page, { overrides: { weather: WEATHER } });
    const mod = buildModuleInstance('weather', { view, ...c.config });
    mod.size = c.size;
    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [mod])],
      settings: { ...matrixSettings(), locationName: 'Prior Lake, MN' },
    }));
    await page.goto('/display');
    const weatherModule = page.locator('[data-module-type="weather"]').first();
    // Wait for real data: before it lands the view renders its empty state,
    // which trivially fits and would satisfy the assertion below vacuously.
    // 78 is day one's high, which all three views render.
    await expect(weatherModule).toContainText('78°');

    // Poll: the fit runs in a layout effect and converges over a pass or two.
    await expect.poll(async () => page.evaluate(() => {
      const pos = document.querySelector('[data-module-type="weather"]') as HTMLElement;
      // Outer flex column -> [optional location header, view box] -> content stack.
      const col = pos.querySelector('div.flex.flex-col') as HTMLElement;
      const box = col.lastElementChild as HTMLElement;
      const view = box.firstElementChild as HTMLElement;
      const content = view.firstElementChild as HTMLElement;
      // Keep polling rather than passing if we somehow measured the empty state.
      if (!content || !content.className.includes('flex-col')) return Number.MAX_SAFE_INTEGER;
      // Both axes: `daily` overflows sideways (day columns) before it does down.
      const overWidth = content.scrollWidth - view.clientWidth;
      if (overWidth > 0) return overWidth;
      // scrollHeight as well as offsetHeight: `combined` fills its box with three
      // fixed bands, so its wrapper is always exactly the box height and only the
      // scroll extent reveals rows spilling out of the last band.
      return Math.max(content.offsetHeight, content.scrollHeight) - view.clientHeight;
    }), 'content height must not exceed the view box').toBeLessThanOrEqual(0);

    // And the last row is really on screen, not clipped at the bottom edge.
    await expect(weatherModule).toContainText('10%');
  });
}
}

/**
 * Overflow assertions can't catch this one: when the font outgrows the width,
 * a flex row absorbs the excess silently — the icon squashes, the high/low
 * breaks onto two lines, the description shrinks to nothing — and the box still
 * reports a clean fit. So the elements that must not deform are asserted
 * directly, at a size where the height-derived font is far too big for the width.
 */
test('compact keeps its icon, high/low and description intact in a tall box', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { weather: WEATHER } });
  const mod = buildModuleInstance('weather', { view: 'compact', showHumidity: true, showWind: true });
  mod.size = { w: 550, h: 390 };
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [mod])],
    settings: matrixSettings(),
  }));
  await page.goto('/display');
  await expect(page.locator('[data-module-type="weather"]').first()).toContainText('78°');

  const shape = await page.evaluate(() => {
    const pos = document.querySelector('[data-module-type="weather"]') as HTMLElement;
    const col = pos.querySelector('div.flex.flex-col') as HTMLElement;
    const view = (col.lastElementChild as HTMLElement).firstElementChild as HTMLElement;
    const row = (view.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
    const font = parseFloat(getComputedStyle(view).fontSize);
    const icon = row.querySelector('svg, img') as HTMLElement;
    const highLow = row.children[2] as HTMLElement;
    const desc = row.children[3] as HTMLElement;
    return {
      // The icon is authored at 1.8em; anything less means flex squashed it.
      iconRatio: icon.getBoundingClientRect().width / font,
      // One line, not two: the high/low must not wrap.
      highLowLines: Math.round(highLow.getBoundingClientRect().height / parseFloat(getComputedStyle(highLow).lineHeight)),
      descWidth: desc.getBoundingClientRect().width,
      font,
    };
  });

  expect(shape.iconRatio, 'weather icon squashed by the row').toBeGreaterThan(1.7);
  expect(shape.highLowLines, 'high/low wrapped onto a second line').toBe(1);
  // The description truncates, but must never be squeezed out of existence.
  expect(shape.descWidth, 'description squeezed to nothing').toBeGreaterThan(shape.font * 3);
});
