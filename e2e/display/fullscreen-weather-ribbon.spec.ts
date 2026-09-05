import { test, expect } from '../fixtures';
import type { Page, APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { richWeather } from '../helpers/weather-payload';
import type { FullscreenTypographySize } from '@/types/config';

/**
 * The temperature ribbon's hour labels must stay clear of the curve.
 *
 * This is invisible to every other check in the suite. The labels and the
 * curve are both inside one `<svg>`, so no element overflows, no two
 * `data-testid` parts intersect, and `useFitScale` sees a layout that fits.
 * The only way to catch it is to compare their bounding boxes in viewBox
 * space, which is what this does.
 *
 * The regression: `TOP` (callout headroom) and `AXIS` (hour labels) scale with
 * the typography ratio `r`, while `VH` shrinks — `renderedH` follows `u`, and
 * the fit loop shrinks `u` as type grows. At 4x-large in landscape the bands
 * wanted 122 units of a 93-unit box, so `CH` and `PB` bottomed out on their
 * floors and the temperature band ran straight through the hour labels. All
 * eight sat on the curve. `r` is now clamped to what the box can seat.
 */

const SIZES: FullscreenTypographySize[] = [
  'small', 'medium', 'large', 'extra-large', '2x-large', '3x-large', '4x-large',
];
const SHAPES = [
  { w: 1920, h: 1080, label: 'landscape' },
  { w: 1080, h: 1920, label: 'portrait' },
  { w: 1880, h: 560, label: 'wide band' },
];

/** Boxes of the axis labels and the temperature curve, in viewBox units. */
function measureRibbon(svg: SVGSVGElement) {
  const paths = [...svg.querySelectorAll('path')].map((p) => (p as unknown as SVGGraphicsElement).getBBox());
  const curve = paths.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
  const texts = [...svg.querySelectorAll('text')].map((t) => ({
    label: (t.textContent ?? '').trim(),
    box: (t as unknown as SVGGraphicsElement).getBBox(),
  }));
  // The hour labels are the bottom row of text in the chart.
  const lowest = Math.max(...texts.map((t) => t.box.y));
  const axis = texts.filter((t) => t.box.y > lowest - 1);
  const collisions = axis.filter((t) => {
    const ox = Math.min(t.box.x + t.box.width, curve.x + curve.width) - Math.max(t.box.x, curve.x);
    const oy = Math.min(t.box.y + t.box.height, curve.y + curve.height) - Math.max(t.box.y, curve.y);
    return ox > 0 && oy > 0;
  }).map((t) => t.label);
  return { axisCount: axis.length, collisions };
}

for (const shape of SHAPES) {
  for (const size of SIZES) {
    test(`ribbon hour labels clear the curve: ${shape.label} at ${size}`, async ({ page, request }) => {
      await stubModuleData(page, {
        overrides: { weather: { ...(richWeather() as Record<string, unknown>), alerts: [], minutely: [] } },
      });
      const vw = Math.max(shape.w, 1024), vh = Math.max(shape.h, 600);
      await page.setViewportSize({ width: vw, height: vh });
      await putConfig(request, baseConfig({
        screens: [makeScreen('s1', 'S1', [{
          ...buildModuleInstance('fullscreen-weather', {
            view: 'panorama', theme: 'linen', typographySize: size, showRibbon: true, showStatRail: false,
          }),
          position: { x: 0, y: 0 }, size: { w: shape.w, h: shape.h },
        }])],
        settings: { ...matrixSettings(), displayWidth: vw, displayHeight: vh, displayTransform: 'normal' },
      }));
      await page.goto('/display');
      const root = page.locator('[data-testid="fullscreen-weather"]');
      await expect(root).toBeVisible();
      await expect(root).toContainText('°');
      await expect(root.locator('[data-fit-settled="true"]')).toHaveCount(1);

      const r = await page.locator('[data-testid="fsw-ribbon"] svg').first()
        .evaluate(measureRibbon as unknown as (el: SVGElement) => ReturnType<typeof measureRibbon>);

      // Guard against a vacuous pass if the labels ever stop rendering.
      expect(r.axisCount, 'no hour labels were found to check').toBeGreaterThan(0);
      expect(r.collisions, `hour labels sitting on the temperature curve: ${r.collisions.join(', ')}`)
        .toEqual([]);
    });
  }
}

/**
 * The high and low of the run are labelled wherever they fall. A falling
 * evening puts the warmest hour at "now", the first point; the ribbon used to
 * skip any extreme in the first four points and show a low with no high.
 */
test.describe('the ribbon labels an extreme at either end of the run', () => {
  async function labels(page: Page, request: APIRequestContext, temps: number[]) {
    const now = Date.now();
    await stubModuleData(page, {
      overrides: {
        weather: {
          ...(richWeather() as Record<string, unknown>),
          hourly: temps.map((temp, i) => ({
            time: new Date(now + i * 3600_000).toISOString(), temp, icon: 'sun', description: 'Clear', precipProbability: 0,
          })),
          alerts: [], minutely: [],
        },
      },
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [{
        ...buildModuleInstance('fullscreen-weather', { view: 'panorama', theme: 'linen', showRibbon: true }),
        position: { x: 0, y: 0 }, size: { w: 1920, h: 1080 },
      }])],
      settings: { ...matrixSettings(), displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal' },
    }));
    await page.goto('/display');
    const root = page.locator('[data-testid="fullscreen-weather"]');
    await expect(root.locator('[data-fit-settled="true"]')).toHaveCount(1);
    return page.locator('[data-testid="fsw-ribbon"] svg').first().evaluate((svg) => {
      const W = (svg as SVGSVGElement).viewBox.baseVal.width;
      return [...svg.querySelectorAll('text')].map((t) => {
        const box = (t as unknown as SVGGraphicsElement).getBBox();
        return { label: (t.textContent ?? '').trim(), left: box.x, right: box.x + box.width, inside: box.x >= 0 && box.x + box.width <= W };
      });
    });
  }

  test('the high at "now" is labelled, inside the chart', async ({ page, request }) => {
    // 24 hours falling from 80 to 61 and back to 75: the high is the first point.
    const temps = [80, 78, 75, 72, 70, 68, 66, 65, 64, 63, 62, 61, 62, 64, 66, 68, 70, 72, 73, 74, 75, 75, 74, 72];
    const found = await labels(page, request, temps);
    const high = found.find((t) => t.label === '80°');
    expect(high, `no high label among: ${found.map((t) => t.label).join(' ')}`).toBeDefined();
    expect(high!.inside).toBe(true);
    expect(found.find((t) => t.label === '61°')?.inside).toBe(true);
  });

  test('the low at the end of the run is labelled, inside the chart', async ({ page, request }) => {
    const temps = Array.from({ length: 24 }, (_, i) => 80 - i);
    const found = await labels(page, request, temps);
    expect(found.find((t) => t.label === '57°')?.inside, 'the last point is the low and must be labelled').toBe(true);
    expect(found.find((t) => t.label === '80°')?.inside).toBe(true);
  });
});
