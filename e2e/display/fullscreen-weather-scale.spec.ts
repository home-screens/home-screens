import { test, expect } from '../fixtures';
import type { Page, APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { richWeather } from '../helpers/weather-payload';
import type { FullscreenTypographySize } from '@/types/config';

/**
 * Scale coverage for fullscreen-weather.
 *
 * Panorama and Almanac are fixed-height stacks on a fixed 1080x1920 canvas —
 * unlike the other fullscreen modules, whose grids reflow — so every dimension
 * scaling off one type multiplier means a large `typographySize` can push the
 * layout past the canvas. Before `useFitScale` existed, Panorama overflowed by
 * 374px at 2x-large and 1389px at 4x-large, and Almanac's bento cards
 * overlapped each other. Neither was visible to any other spec.
 *
 * The assertion is overflow, because that is the failure: content taller or
 * wider than the frame is clipped on a wall display with no way to scroll.
 */

async function render(
  page: Page, request: APIRequestContext, config: Record<string, unknown>,
): Promise<{ overY: number; overX: number; heroPx: number; clockPx: number; padPx: number; errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await stubModuleData(page, { overrides: { weather: richWeather() } });
  await page.setViewportSize({ width: 1080, height: 1920 });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('fullscreen-weather', config)])],
    settings: matrixSettings(),
  }));
  await page.goto('/display');

  const root = page.locator('[data-testid="fullscreen-weather"]');
  await expect(root).toBeVisible();
  await expect(root).toContainText('°');

  // useFitScale converges over a few animation frames.
  await page.waitForTimeout(400);

  return root.evaluate((el) => {
    const stack = el.querySelector(':scope > div:last-child') as HTMLElement;
    const hero = el.querySelector('[data-testid="fsw-hero-temp"]');
    const clock = el.querySelector('[data-testid="fsw-clock"]');
    return {
      overY: stack.scrollHeight - stack.clientHeight,
      overX: stack.scrollWidth - stack.clientWidth,
      heroPx: hero ? parseFloat(getComputedStyle(hero).fontSize) : 0,
      // Present in every view, so it works as the type-size probe for all three.
      clockPx: clock ? parseFloat(getComputedStyle(clock).fontSize) : 0,
      padPx: parseFloat(getComputedStyle(stack).paddingTop),
      errors: [] as string[],
    };
  }).then((r) => ({ ...r, errors }));
}

const SIZES: FullscreenTypographySize[] = [
  'small', 'medium', 'large', 'extra-large', '2x-large', '3x-large', '4x-large',
];

for (const view of ['panorama', 'almanac', 'ambient'] as const) {
  for (const typographySize of SIZES) {
    test(`${view} fits the canvas at ${typographySize}`, async ({ page, request }) => {
      const r = await render(page, request, { view, typographySize, theme: 'linen' });
      expect(r.errors, `render errors: ${r.errors.join('; ')}`).toEqual([]);
      expect(r.overY, `${view}/${typographySize} overflows vertically by ${r.overY}px`).toBeLessThanOrEqual(2);
      expect(r.overX, `${view}/${typographySize} overflows horizontally by ${r.overX}px`).toBeLessThanOrEqual(2);
    });
  }

  // Cozy density widens every gap, so the extremes are re-checked with it.
  test(`${view} fits the canvas at 4x-large with cozy density`, async ({ page, request }) => {
    const r = await render(page, request, { view, typographySize: '4x-large', density: 'cozy', theme: 'linen' });
    expect(r.overY).toBeLessThanOrEqual(2);
    expect(r.overX).toBeLessThanOrEqual(2);
  });
}

test('panorama grows its type when sections are switched off', async ({ page, request }) => {
  // The fit is a response to content, not a fixed ceiling: dropping the
  // nowcast, ribbon, and stat rail must buy back real type size at 4x-large.
  const full = await render(page, request, { view: 'panorama', typographySize: '4x-large', theme: 'linen' });
  const lean = await render(page, request, {
    view: 'panorama', typographySize: '4x-large', theme: 'linen',
    showNowcast: false, showRibbon: false, showStatRail: false, showAlerts: false,
  });
  expect(lean.overY).toBeLessThanOrEqual(2);
  expect(
    lean.heroPx,
    `lean hero ${lean.heroPx}px should exceed full hero ${full.heroPx}px`,
  ).toBeGreaterThan(full.heroPx);
});


/**
 * The typography and density controls must visibly do something.
 *
 * Both shipped inert. Every dimension scaled off one type multiplier, so a
 * larger `typographySize` inflated chart heights and padding too, the stack
 * outgrew the canvas, and the fit correction shrank it all back: measured
 * 184 / 216 / 248 / 246 / 240px across small..4x-large, i.e. *smaller* above
 * `large`. Density, meanwhile, drove exactly one row-gap — 22px vs 26px.
 *
 * Structure and type now scale on separate units, and the fit bisects for the
 * largest factor that fits rather than shrinking one-directionally (which
 * landed on a different factor depending on how many passes it took, and was
 * itself a source of non-monotonicity).
 */
test.describe('the scale controls have an effect', () => {
  for (const view of ['panorama', 'almanac', 'ambient'] as const) {
    test(`${view}: type grows with every step up the typography scale`, async ({ page, request }) => {
      const sizes: FullscreenTypographySize[] = ['small', 'medium', 'large', '2x-large', '4x-large'];
      const measured: Array<{ size: string; px: number }> = [];
      for (const typographySize of sizes) {
        const r = await render(page, request, { view, typographySize, theme: 'linen' });
        measured.push({ size: typographySize, px: r.clockPx });
      }
      const trail = measured.map((m) => `${m.size}=${m.px}`).join(' ');
      for (let i = 1; i < measured.length; i++) {
        expect(
          measured[i].px,
          `${view}: ${measured[i].size} must render larger type than ${measured[i - 1].size} (${trail})`,
        ).toBeGreaterThan(measured[i - 1].px);
      }
    });

    test(`${view}: cozy density gives more breathing room than snug`, async ({ page, request }) => {
      const snug = await render(page, request, { view, density: 'snug', theme: 'linen' });
      const cozy = await render(page, request, { view, density: 'cozy', theme: 'linen' });
      expect(
        cozy.padPx,
        `${view}: cozy padding ${cozy.padPx}px should exceed snug ${snug.padPx}px`,
      ).toBeGreaterThan(snug.padPx * 1.05);
    });
  }
});

/** The header clock is opt-out and applies to every view. */
test.describe('showTime', () => {
  for (const view of ['panorama', 'almanac', 'ambient'] as const) {
    test(`${view}: the clock renders by default and hides when switched off`, async ({ page, request }) => {
      await render(page, request, { view, theme: 'linen' });
      await expect(page.locator('[data-testid="fsw-clock"]')).toHaveCount(1);

      await render(page, request, { view, theme: 'linen', showTime: false });
      await expect(page.locator('[data-testid="fsw-clock"]')).toHaveCount(0);
    });
  }
});


/**
 * Nothing the temperature ribbon draws may escape its own viewBox.
 *
 * The ribbon is an SVG with a fixed viewBox scaled to the card, so any value
 * expressed in CSS pixels rather than viewBox units means something different
 * at every typography setting. Two labels were positioned that way and the
 * card clipped them at 4x-large: the hi/lo callout ran off the top, and the
 * first hour label rendered as "0a" because a centred anchor hung half its
 * width past x=0.
 */
test.describe('the temperature ribbon keeps its labels inside the chart', () => {
  const sizes: FullscreenTypographySize[] = ['small', 'medium', 'large', '2x-large', '3x-large', '4x-large'];
  for (const typographySize of sizes) {
    test(`no ribbon text is clipped at ${typographySize}`, async ({ page, request }) => {
      await render(page, request, { view: 'panorama', typographySize, theme: 'linen' });

      const escaped = await page.evaluate(() => {
        const svgs = Array.from(document.querySelectorAll('[data-testid="fullscreen-weather"] svg'));
        // The ribbon is the only chart carrying <text> hour labels.
        const svg = svgs.find((el) => el.querySelectorAll('text').length > 2) as SVGSVGElement | undefined;
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
