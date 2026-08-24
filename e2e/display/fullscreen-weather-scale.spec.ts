import { test, expect } from '../fixtures';
import type { Page, APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
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

/** A payload rich enough that every optional section renders. */
function richWeather() {
  const now = Date.now();
  return {
    hourly: Array.from({ length: 48 }, (_, i) => {
      const h = (14 + i) % 24;
      const temp = Math.round(71 + 12 * Math.cos(((h - 15) / 24) * Math.PI * 2));
      return {
        time: new Date(now + i * 3600_000).toISOString(),
        temp, feelsLike: temp + 3, humidity: 44 + (i % 20),
        pressure: 1012 - Math.round(i / 6), dewPoint: temp - 26,
        uvIndex: h > 9 && h < 17 ? 7 : 0, visibility: 10,
        icon: i % 11 === 3 ? 'cloud-rain' : 'sun',
        description: i % 11 === 3 ? 'Rain' : 'Sunny',
        windSpeed: 6 + (i % 9), precipProbability: i % 11 === 3 ? 70 : 0,
      };
    }),
    forecast: Array.from({ length: 7 }, (_, d) => ({
      date: new Date(now + d * 86400_000).toISOString().slice(0, 10),
      high: 84 - d * 2, low: 58 + d, icon: 'sun', description: 'Sunny',
      precipProbability: d === 3 ? 80 : 5,
    })),
    minutely: Array.from({ length: 60 }, (_, m) => ({
      time: Math.floor(now / 1000) + m * 60,
      intensity: Math.max(0, 0.34 * (1 - m / 42)), probability: Math.max(0, 90 - m * 2),
    })),
    alerts: [{
      title: 'Severe Thunderstorm Warning', severity: 'Severe',
      description: 'Until 7:45 PM. Damaging wind gusts to 60 mph and quarter-size hail.',
      expires: Math.floor(now / 1000) + 7200,
    }],
  };
}

async function render(
  page: Page, request: APIRequestContext, config: Record<string, unknown>,
): Promise<{ overY: number; overX: number; heroPx: number; errors: string[] }> {
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
    return {
      overY: stack.scrollHeight - stack.clientHeight,
      overX: stack.scrollWidth - stack.clientWidth,
      heroPx: hero ? parseFloat(getComputedStyle(hero).fontSize) : 0,
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
