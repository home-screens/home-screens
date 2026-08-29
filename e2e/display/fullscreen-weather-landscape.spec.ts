import { test, expect } from '../fixtures';
import type { Page, APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { richWeather } from '../helpers/weather-payload';
import { measureParts, type PartReport } from '../helpers/part-geometry';
import type { FullscreenTypographySize, FullscreenWeatherView } from '@/types/config';

const VIEWS: FullscreenWeatherView[] = ['panorama', 'almanac', 'ambient', 'week', 'hourly'];

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
  /** Pairwise collision report over every `data-testid` part in the stack. */
  parts: PartReport;
  errors: string[];
}

/**
 * Overlays that sit on other parts by design. The hourly spline spans the
 * whole hour list; the week ribbon's now-ring is pinned on today's bar.
 */
const DELIBERATE_OVERLAYS = ['fsw-hourly-spline', 'fsw-now-ring'];

const LANDSCAPE = { w: 1920, h: 1080 };
const SMALL_LANDSCAPE = { w: 1280, h: 800 };
const PORTRAIT = { w: 1080, h: 1920 };

/**
 * Two payloads, because the layout is a different shape under each and the
 * hero overflow only shows under one. `richWeather` carries minutely data and
 * an alert, so Panorama's left column fills with the nowcast strip and the
 * alert band, the stack overflows vertically, and the fit loop shrinks the
 * hero into its column as a side effect. Only Pirate Weather returns minutely
 * data and alerts are rare, so the plain payload is what most walls show: a
 * left column with slack, a fit factor of 1, and the hero as wide as the
 * typography size makes it.
 */
const PAYLOADS = {
  plain: () => ({ ...richWeather(), minutely: [], alerts: [] }),
  rich: () => richWeather(),
} as const;
type PayloadKind = keyof typeof PAYLOADS;

interface RenderOpts {
  payload?: ReturnType<typeof richWeather>;
  settings?: Record<string, unknown>;
  /**
   * Module box, when it should not fill the canvas. The module derives its
   * orientation from its own rendered box, so a portrait display can host a
   * landscape module: that is how a user shrinking a fullscreen module in
   * the editor found the hero overflowing its column.
   */
  module?: { x: number; y: number; w: number; h: number };
}

async function render(
  page: Page,
  request: APIRequestContext,
  canvas: { w: number; h: number },
  config: Record<string, unknown>,
  opts: RenderOpts = {},
): Promise<Measured> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const box = opts.module ?? { x: 0, y: 0, w: canvas.w, h: canvas.h };
  await stubModuleData(page, { overrides: { weather: opts.payload ?? richWeather() } });
  await page.setViewportSize({ width: canvas.w, height: canvas.h });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [{
      ...buildModuleInstance('fullscreen-weather', { theme: 'linen', ...config }),
      // `fillsCanvas` sizes the module to the canvas in the editor; a config
      // written by hand has to say so itself.
      position: { x: box.x, y: box.y },
      size: { w: box.w, h: box.h },
    }])],
    settings: {
      ...matrixSettings(),
      displayWidth: canvas.w, displayHeight: canvas.h, displayTransform: 'normal',
      ...opts.settings,
    },
  }));
  await page.goto('/display');

  const root = page.locator('[data-testid="fullscreen-weather"]');
  await expect(root).toBeVisible();
  await expect(root).toContainText('°');

  // useFitScale bisects over several animation frames and can wait on React
  // to commit each probe; the stack stamps data-fit-settled when it is done.
  await expect(root.locator('[data-fit-settled="true"]')).toHaveCount(1);

  const parts = await page.evaluate(measureParts, {
    rootSelector: '[data-testid="fsw-stack"]', ignore: DELIBERATE_OVERLAYS,
  });

  return root.evaluate((el) => {
    const stack = el.querySelector('[data-testid="fsw-stack"]') as HTMLElement;
    return {
      overY: stack.scrollHeight - stack.clientHeight,
      overX: stack.scrollWidth - stack.clientWidth,
      orientation: el.getAttribute('data-orientation'),
      errors: [] as string[],
    };
  }).then((r) => ({ ...r, parts, errors }));
}

/**
 * The stack's scroll metrics see overflow past its own edge and nothing
 * else. Content that outgrows a fixed-width column renders over the next
 * column without moving either number, so every fit test also asserts that
 * no part collides with another. The count floor keeps the pairwise check
 * from passing vacuously when a selector stops matching.
 */
function expectNoCollisions(r: Measured, label: string) {
  expect(r.parts.count, `${label}: too few parts measured`).toBeGreaterThanOrEqual(3);
  expect(r.parts.overlaps, `${label}: parts overlap:\n  ${r.parts.overlaps.join('\n  ')}`).toEqual([]);
  expect(r.parts.escaped, `${label}: parts escape the stack:\n  ${r.parts.escaped.join('\n  ')}`).toEqual([]);
}

const SIZES: FullscreenTypographySize[] = [
  'small', 'medium', 'large', 'extra-large', '2x-large', '3x-large', '4x-large',
];

test.describe('every view fits a landscape canvas', () => {
  for (const view of VIEWS) {
    for (const payloadKind of Object.keys(PAYLOADS) as PayloadKind[]) {
      for (const typographySize of SIZES) {
        test(`${view} fits 1920x1080 at ${typographySize} (${payloadKind} payload)`, async ({ page, request }) => {
          const r = await render(page, request, LANDSCAPE, { view, typographySize }, { payload: PAYLOADS[payloadKind]() });
          expect(r.errors, `render errors: ${r.errors.join('; ')}`).toEqual([]);
          expect(r.orientation).toBe('landscape');
          expect(r.overY, `${view}/${typographySize} overflows vertically by ${r.overY}px`).toBeLessThanOrEqual(2);
          expect(r.overX, `${view}/${typographySize} overflows horizontally by ${r.overX}px`).toBeLessThanOrEqual(2);
          expectNoCollisions(r, `${view}/${typographySize}/${payloadKind}`);
        });
      }

      // A smaller landscape panel is a different problem: `bu` is 8 rather than
      // 10.8, so the whole layout comes down ~26% before the fit loop even runs.
      test(`${view} fits 1280x800 at 4x-large with cozy density (${payloadKind} payload)`, async ({ page, request }) => {
        const r = await render(page, request, SMALL_LANDSCAPE, {
          view, typographySize: '4x-large', density: 'cozy',
        }, { payload: PAYLOADS[payloadKind]() });
        expect(r.errors, `render errors: ${r.errors.join('; ')}`).toEqual([]);
        expect(r.orientation).toBe('landscape');
        expect(r.overY).toBeLessThanOrEqual(2);
        expect(r.overX).toBeLessThanOrEqual(2);
        expectNoCollisions(r, `${view}/4x-large/cozy/${payloadKind} @1280x800`);
      });
    }
  }
});

/**
 * Landscape does not need a landscape display. The module reads orientation
 * off its own box, so shrinking a fullscreen module on a portrait display
 * until it is wider than tall flips it to the two-column arrangement — with
 * a much smaller `bu`, and a left column too narrow for the hero at any
 * typography size above medium. That is how the column overflow was found,
 * and it has to hold however the box got its shape.
 */
test.describe('a module resized into landscape on a portrait display', () => {
  // Roughly the box the report came from: a portrait canvas, module dragged
  // down to a wide panel across the top.
  const PANEL = { x: 24, y: 24, w: 1032, h: 660 };

  for (const view of VIEWS) {
    for (const typographySize of ['large', '4x-large'] as FullscreenTypographySize[]) {
      test(`${view} fits a ${PANEL.w}x${PANEL.h} panel at ${typographySize}`, async ({ page, request }) => {
        const r = await render(page, request, PORTRAIT, { view, typographySize }, { module: PANEL, payload: PAYLOADS.plain() });
        expect(r.errors, `render errors: ${r.errors.join('; ')}`).toEqual([]);
        expect(r.orientation).toBe('landscape');
        expect(r.overY, `${view}/${typographySize} overflows vertically by ${r.overY}px`).toBeLessThanOrEqual(2);
        expect(r.overX, `${view}/${typographySize} overflows horizontally by ${r.overX}px`).toBeLessThanOrEqual(2);
        expectNoCollisions(r, `${view}/${typographySize} in a ${PANEL.w}x${PANEL.h} panel`);
      });
    }
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

/**
 * Week ahead and Hour by hour are one set of parts in two arrangements:
 * bands stacked down the page in portrait, columns across it in landscape.
 * As with panorama, overflow alone would pass a portrait stack that happened
 * to be short enough, so these assert the axis the parts run along.
 */
async function boxes(page: Page, testId: string) {
  const els = page.locator(`[data-testid="${testId}"]`);
  const n = await els.count();
  const out: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let i = 0; i < n; i++) out.push((await els.nth(i).boundingBox())!);
  return out;
}

function runsAlong(b: Array<{ x: number; y: number }>, axis: 'x' | 'y'): boolean {
  const other = axis === 'x' ? 'y' : 'x';
  for (let i = 1; i < b.length; i++) {
    if (b[i][axis] <= b[i - 1][axis]) return false;
    if (Math.abs(b[i][other] - b[i - 1][other]) > 2) return false;
  }
  return true;
}

test.describe('week ahead: bands in portrait, columns in landscape', () => {
  test('portrait stacks the days down the page', async ({ page, request }) => {
    await render(page, request, PORTRAIT, { view: 'week' });
    await expect(page.locator('[data-testid="fsw-week"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="fsw-mini-hero"]')).toHaveCount(1);
    const days = await boxes(page, 'fsw-week-day');
    expect(days).toHaveLength(7);
    expect(runsAlong(days, 'y'), 'days should stack top to bottom').toBe(true);
  });

  test('each day carries its rain chance and wind', async ({ page, request }) => {
    // richWeather gives day 3 an 80% chance and every day a wind speed; day 0
    // sits at 5%, below the threshold, so its details line shows wind alone.
    await render(page, request, PORTRAIT, { view: 'week' });
    const days = page.locator('[data-testid="fsw-week-day"]');
    await expect(days.nth(3)).toContainText('80%');
    await expect(days.nth(0)).not.toContainText('%');
    await expect(days.nth(0)).toContainText('8 mph');
  });

  test('landscape stands the days up as columns', async ({ page, request }) => {
    await render(page, request, LANDSCAPE, { view: 'week' });
    await expect(page.locator('[data-testid="fsw-week"]')).toHaveCount(1);
    const days = await boxes(page, 'fsw-week-day');
    expect(days).toHaveLength(7);
    expect(runsAlong(days, 'x'), 'days should run left to right').toBe(true);
    // A column, not a band: taller than it is wide.
    for (const d of days) expect(d.height).toBeGreaterThan(d.width);
  });

  test('today marks the current temperature in both arrangements', async ({ page, request }) => {
    await render(page, request, PORTRAIT, { view: 'week' });
    await expect(page.locator('[data-testid="fsw-now-ring"]')).toHaveCount(1);
    await render(page, request, LANDSCAPE, { view: 'week' });
    await expect(page.locator('[data-testid="fsw-now-ring"]')).toHaveCount(1);
  });
});

test.describe('hour by hour: time runs down in portrait, across in landscape', () => {
  test('portrait lists the hours as rows', async ({ page, request }) => {
    await render(page, request, PORTRAIT, { view: 'hourly' });
    await expect(page.locator('[data-testid="fsw-hourly"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="fsw-mini-hero"]')).toHaveCount(1);
    const hours = await boxes(page, 'fsw-hour');
    expect(hours).toHaveLength(24);
    expect(runsAlong(hours, 'y'), 'hours should run top to bottom').toBe(true);
  });

  test('landscape lays the hours out as columns', async ({ page, request }) => {
    await render(page, request, LANDSCAPE, { view: 'hourly' });
    await expect(page.locator('[data-testid="fsw-hourly"]')).toHaveCount(1);
    const hours = await boxes(page, 'fsw-hour');
    expect(hours).toHaveLength(24);
    expect(runsAlong(hours, 'x'), 'hours should run left to right').toBe(true);
  });

  /**
   * The spline is an SVG in an absolutely positioned wrapper. An SVG given
   * only `top`/`bottom` keeps its intrinsic 150px height (it is a replaced
   * element), which is exactly how the mockup first rendered: a curve
   * through the first three rows and nothing below. The overlay must span
   * the list along the time axis, and the curve must pass through the dots.
   */
  for (const [name, canvas, axis] of [['portrait', PORTRAIT, 'y'], ['landscape', LANDSCAPE, 'x']] as const) {
    test(`${name}: the curve spans the whole list and lands on its dots`, async ({ page, request }) => {
      await render(page, request, canvas, { view: 'hourly' });
      const hours = await boxes(page, 'fsw-hour');
      const spline = (await page.locator('[data-testid="fsw-hourly-spline"]').boundingBox())!;
      const first = hours[0], last = hours[hours.length - 1];
      const listStart = first[axis];
      const listEnd = last[axis] + (axis === 'y' ? last.height : last.width);
      const splineEnd = spline[axis] + (axis === 'y' ? spline.height : spline.width);
      expect(Math.abs(spline[axis] - listStart), 'overlay should start with the list').toBeLessThanOrEqual(2);
      expect(Math.abs(splineEnd - listEnd), 'overlay should end with the list').toBeLessThanOrEqual(2);

      // Sample the path at each dot's position along the time axis and check
      // it passes through the dot's centre on the other axis.
      const misses = await page.evaluate(() => {
        const svg = document.querySelector('[data-testid="fsw-hourly-spline"] svg') as SVGSVGElement;
        const path = svg.querySelector('path') as SVGPathElement;
        const dots = Array.from(document.querySelectorAll('[data-testid="fsw-hour-dot"]'))
          .map((d) => { const r = d.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
        const box = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const sx = box.width / vb.width, sy = box.height / vb.height;
        // Sample the path once, densely: its length is in viewBox units, and
        // the viewBox is 100 x N, so a coarse step along the time axis is
        // several screen pixels wide and a sharp turn falls between samples.
        const total = path.getTotalLength();
        const samples: Array<[number, number]> = [];
        for (let i = 0; i <= 20000; i++) {
          const pt = path.getPointAtLength((total * i) / 20000);
          samples.push([box.left + pt.x * sx, box.top + pt.y * sy]);
        }
        const out: string[] = [];
        for (const d of dots) {
          let best = Infinity;
          for (const [px, py] of samples) {
            const dist = Math.hypot(px - d.cx, py - d.cy);
            if (dist < best) best = dist;
          }
          if (best > 3) out.push(`dot at ${d.cx.toFixed(0)},${d.cy.toFixed(0)} is ${best.toFixed(1)}px off the curve`);
        }
        return out;
      });
      expect(misses, misses.join('\n')).toEqual([]);
    });
  }

  test('the row that opens a new day is labelled with the day', async ({ page, request }) => {
    // Pinned start and zone: with the payload at the wall clock, a run that
    // began between 00:00 and 00:59 had its only day-opening entry at index
    // 0, which renders as "Now", and the test failed once a day. 19:00Z is
    // 14:00 in Chicago, so the day turns at row 10.
    const timezone = 'America/Chicago';
    const start = Date.UTC(2099, 6, 7, 19);
    const payload = richWeather(start);
    const dayOf = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date(ms));
    const crossing = payload.hourly.findIndex((h, i) => i > 0 && dayOf(Date.parse(h.time)) !== dayOf(Date.parse(payload.hourly[i - 1].time)));
    expect(crossing).toBe(10);

    await render(page, request, PORTRAIT, { view: 'hourly' }, { payload, settings: { timezone } });
    const labels = await page.locator('[data-testid="fsw-hour"] > div:nth-child(1), [data-testid="fsw-hour"] > div:nth-child(2)').allTextContents();
    const hourLabels = labels.map((l) => l.trim()).filter((l) => l !== '');
    expect(hourLabels[0]).toBe('Now');
    expect(hourLabels[crossing]).toBe(dayOf(Date.parse(payload.hourly[crossing].time)));
    // The only day label is the crossing; the other rows are clock hours.
    expect(hourLabels.filter((l) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/.test(l))).toHaveLength(1);
    expect(hourLabels).not.toContain('12a');
  });
});
