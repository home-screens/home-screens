import { test, expect } from '../fixtures';
import type { Page, APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { richWeather } from '../helpers/weather-payload';
import type { FullscreenTypographySize } from '@/types/config';

/**
 * Landscape coverage for fullscreen-weather.
 *
 * The module shipped portrait-only. On a 1920x1080 canvas Almanac overflowed
 * off the bottom by 309px (137px at 1280x800) and could not be rescued: its
 * `minmax(min-content, ...)` grid rows floor the bento above the canvas
 * height, so `useFitScale` correctly bottoms out rather than fitting. Panorama
 * did not overflow but rendered as a stretched portrait — seven full-width
 * bands, 7-day tracks 1600px wide, and half a screen of dead air in the hero.
 *
 * Each view now picks an arrangement from `scale.orientation`. These specs
 * guard both halves of that: the canvas is respected (no overflow at any
 * typography size, on two landscape shapes), and the arrangement is actually
 * different (two columns, not a stack).
 */

interface Measured {
  overY: number;
  overX: number;
  orientation: string | null;
  errors: string[];
}

const LANDSCAPE = { w: 1920, h: 1080 };
const SMALL_LANDSCAPE = { w: 1280, h: 800 };
const PORTRAIT = { w: 1080, h: 1920 };

async function render(
  page: Page,
  request: APIRequestContext,
  canvas: { w: number; h: number },
  config: Record<string, unknown>,
): Promise<Measured> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await stubModuleData(page, { overrides: { weather: richWeather() } });
  await page.setViewportSize({ width: canvas.w, height: canvas.h });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [{
      ...buildModuleInstance('fullscreen-weather', { theme: 'linen', ...config }),
      // `fillsCanvas` sizes the module to the canvas in the editor; a config
      // written by hand has to say so itself.
      size: { w: canvas.w, h: canvas.h },
    }])],
    settings: {
      ...matrixSettings(),
      displayWidth: canvas.w, displayHeight: canvas.h, displayTransform: 'normal',
    },
  }));
  await page.goto('/display');

  const root = page.locator('[data-testid="fullscreen-weather"]');
  await expect(root).toBeVisible();
  await expect(root).toContainText('°');

  // useFitScale converges over a few animation frames.
  await page.waitForTimeout(400);

  return root.evaluate((el) => {
    const stack = el.querySelector(':scope > div:last-child') as HTMLElement;
    return {
      overY: stack.scrollHeight - stack.clientHeight,
      overX: stack.scrollWidth - stack.clientWidth,
      orientation: el.getAttribute('data-orientation'),
      errors: [] as string[],
    };
  }).then((r) => ({ ...r, errors }));
}

const SIZES: FullscreenTypographySize[] = [
  'small', 'medium', 'large', 'extra-large', '2x-large', '3x-large', '4x-large',
];

test.describe('every view fits a landscape canvas', () => {
  for (const view of ['panorama', 'almanac', 'ambient'] as const) {
    for (const typographySize of SIZES) {
      test(`${view} fits 1920x1080 at ${typographySize}`, async ({ page, request }) => {
        const r = await render(page, request, LANDSCAPE, { view, typographySize });
        expect(r.errors, `render errors: ${r.errors.join('; ')}`).toEqual([]);
        expect(r.orientation).toBe('landscape');
        expect(r.overY, `${view}/${typographySize} overflows vertically by ${r.overY}px`).toBeLessThanOrEqual(2);
        expect(r.overX, `${view}/${typographySize} overflows horizontally by ${r.overX}px`).toBeLessThanOrEqual(2);
      });
    }

    // A smaller landscape panel is a different problem: `bu` is 8 rather than
    // 10.8, so the whole layout comes down ~26% before the fit loop even runs.
    test(`${view} fits 1280x800 at 4x-large with cozy density`, async ({ page, request }) => {
      const r = await render(page, request, SMALL_LANDSCAPE, {
        view, typographySize: '4x-large', density: 'cozy',
      });
      expect(r.errors, `render errors: ${r.errors.join('; ')}`).toEqual([]);
      expect(r.orientation).toBe('landscape');
      expect(r.overY).toBeLessThanOrEqual(2);
      expect(r.overX).toBeLessThanOrEqual(2);
    });
  }
});

/**
 * Orientation is derived from the rendered box, with ties going to portrait —
 * a square canvas reads correctly as a vertical stack, and splitting it leaves
 * both columns too narrow for the charts.
 */
test.describe('orientation follows the canvas', () => {
  test('a taller-than-wide canvas stays portrait', async ({ page, request }) => {
    const r = await render(page, request, PORTRAIT, { view: 'panorama' });
    expect(r.orientation).toBe('portrait');
  });

  test('a square canvas stays portrait', async ({ page, request }) => {
    const r = await render(page, request, { w: 1080, h: 1080 }, { view: 'panorama' });
    expect(r.orientation).toBe('portrait');
    expect(r.overY).toBeLessThanOrEqual(2);
  });
});

/**
 * The arrangement has to actually change, not just fit.
 *
 * Overflow assertions alone would pass on a portrait stack that happened to
 * be short enough — which is exactly the state Panorama shipped in. These
 * assert the geometry that makes landscape landscape, so a refactor that
 * collapses it back to a stack fails here rather than on someone's wall.
 */
test.describe('landscape panorama is two columns', () => {
  test('the ribbon sits beside the hero, not below it', async ({ page, request }) => {
    await render(page, request, LANDSCAPE, { view: 'panorama' });

    const hero = await page.locator('[data-testid="fsw-hero-temp"]').boundingBox();
    const ribbon = await page.locator('[data-testid="fsw-ribbon"]').boundingBox();
    expect(hero, 'hero not rendered').not.toBeNull();
    expect(ribbon, 'ribbon not rendered').not.toBeNull();

    // Beside: the ribbon starts to the right of where the hero ends, and their
    // vertical extents overlap. A stacked layout satisfies neither.
    expect(ribbon!.x, `ribbon x=${ribbon!.x} should start right of hero end ${hero!.x + hero!.width}`)
      .toBeGreaterThan(hero!.x + hero!.width);
    expect(ribbon!.y).toBeLessThan(hero!.y + hero!.height);
  });

  test('portrait keeps the ribbon below the hero', async ({ page, request }) => {
    await render(page, request, PORTRAIT, { view: 'panorama' });

    const hero = await page.locator('[data-testid="fsw-hero-temp"]').boundingBox();
    const ribbon = await page.locator('[data-testid="fsw-ribbon"]').boundingBox();
    expect(ribbon!.y).toBeGreaterThan(hero!.y + hero!.height);
  });

  test('the stat rail stands up in the left column', async ({ page, request }) => {
    await render(page, request, LANDSCAPE, { view: 'panorama' });

    const rail = page.locator('[data-testid="fsw-stat-rail"]');
    await expect(rail).toHaveCount(1);
    const box = (await rail.boundingBox())!;
    // The portrait rail is a wide strip; the landscape one is a tall column in
    // a third of the canvas. Anything wider than half the canvas is the strip.
    expect(box.width, `rail width ${box.width} should be a column, not a strip`).toBeLessThan(LANDSCAPE.w / 2);
    expect(box.height).toBeGreaterThan(box.width * 0.5);
  });

  test('showStatRail:false still hides it in landscape', async ({ page, request }) => {
    const r = await render(page, request, LANDSCAPE, { view: 'panorama', showStatRail: false });
    await expect(page.locator('[data-testid="fsw-stat-rail"]')).toHaveCount(0);
    // The hero absorbs the freed space rather than leaving a hole.
    expect(r.overY).toBeLessThanOrEqual(2);
  });
});

/**
 * The ribbon reconstructs its own rendered width to keep its viewBox aspect
 * honest, and landscape changed that arithmetic — the card sits in the
 * right-hand column rather than spanning the canvas. Get it wrong and
 * `preserveAspectRatio="none"` stretches every label.
 *
 * Mirrors the portrait guard in fullscreen-weather-scale.spec.ts: bbox against
 * viewBox catches the whole class, not one label.
 */
test.describe('the landscape ribbon keeps its labels inside the chart', () => {
  for (const typographySize of ['medium', '2x-large', '4x-large'] as FullscreenTypographySize[]) {
    test(`no ribbon text is clipped at ${typographySize}`, async ({ page, request }) => {
      await render(page, request, LANDSCAPE, { view: 'panorama', typographySize });

      const escaped = await page.evaluate(() => {
        const svg = document.querySelector('[data-testid="fsw-ribbon"] svg') as SVGSVGElement | null;
        if (!svg) return ['ribbon svg not found'];
        const vb = svg.viewBox.baseVal;
        const out: string[] = [];
        for (const node of Array.from(svg.querySelectorAll('text'))) {
          const b = (node as SVGGraphicsElement).getBBox();
          if (b.x < vb.x - 0.5 || b.y < vb.y - 0.5
              || b.x + b.width > vb.x + vb.width + 0.5
              || b.y + b.height > vb.y + vb.height + 0.5) {
            out.push(`"${node.textContent}" bbox=${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.width.toFixed(0)}x${b.height.toFixed(0)} outside 0,0 ${vb.width}x${vb.height}`);
          }
        }
        return out;
      });

      expect(escaped, `ribbon text outside the viewBox:\n  ${escaped.join('\n  ')}`).toEqual([]);
    });
  }
});

/**
 * Almanac is the view that actually failed, and it failed by overlapping as
 * well as overflowing. Cards sharing a row must not intersect: that is the
 * symptom the portrait `minmax(min-content, ...)` floors were added to cure,
 * and the landscape flex rows have to hold the same line on their own.
 *
 * The card count is asserted first. Without it this passes vacuously the
 * moment the selector stops matching — which is the failure mode a geometry
 * assertion is most prone to, since nothing else in the test would notice.
 */
test.describe('landscape almanac cards do not collide', () => {
  for (const typographySize of ['medium', '4x-large'] as FullscreenTypographySize[]) {
    test(`no card overlaps another at ${typographySize}`, async ({ page, request }) => {
      await render(page, request, LANDSCAPE, { view: 'almanac', typographySize });

      // Sun, moon, next-12, and the five readouts the rich payload populates.
      await expect(page.locator('[data-testid="fsw-card"]')).toHaveCount(8);

      const overlaps = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-testid="fsw-card"]'))
          .map((el) => ({ rect: el.getBoundingClientRect(), label: el.textContent?.slice(0, 18) ?? '' }));

        const out: string[] = [];
        for (let i = 0; i < cards.length; i++) {
          for (let j = i + 1; j < cards.length; j++) {
            const a = cards[i], b = cards[j];
            const ox = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
            const oy = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
            if (ox > 2 && oy > 2) out.push(`"${a.label}" and "${b.label}" overlap by ${ox.toFixed(0)}x${oy.toFixed(0)}px`);
          }
        }
        return out;
      });

      expect(overlaps, `almanac cards overlap:\n  ${overlaps.join('\n  ')}`).toEqual([]);
    });
  }
});
