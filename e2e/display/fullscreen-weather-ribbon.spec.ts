import { test, expect } from '../fixtures';
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
