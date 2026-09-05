import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';

/**
 * A photo slideshow must never show an empty frame between slides. The two
 * slide layers crossfade, and the incoming layer is hidden until its own
 * image has loaded; the swap therefore has to wait for that load. Flipping on
 * the rotation timer alone faded the outgoing photo out over a layer with
 * nothing in it, so a slow cloud photo left a blank frame and a photo whose
 * download failed left one until the next slide.
 *
 * Both photo modules go through `/api/` URLs (swapped for blob: URLs by
 * useAuthImage), so the serve route is stubbed with a deliberate delay or a
 * 404 and the frame is sampled while the rotation runs. The invariant: the
 * visible layers' opacities always sum to about 1. During a real crossfade
 * the two layers add up to one; a blank frame adds up to zero.
 */

const GIF_BYTES = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const SERVED_A = '/api/backgrounds/serve?file=a.gif';
const SERVED_B = '/api/backgrounds/serve?file=b.gif';
const SERVED_DEAD = '/api/backgrounds/serve?file=dead.gif';

const INTERVAL_MS = 1500;
const SLOW_MS = 3000;

async function stubServe(page: Page, slow: string[], dead: string[]) {
  await page.route('**/api/backgrounds/serve*', async (route) => {
    const file = new URL(route.request().url()).searchParams.get('file') ?? '';
    if (dead.includes(file)) return route.fulfill({ status: 404, body: 'gone' });
    if (slow.includes(file)) await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    return route.fulfill({ body: GIF_BYTES, contentType: 'image/gif' });
  });
}

interface FrameSample {
  /** ms since sampling began. */
  t: number;
  /** Sum of computed opacity over layers that are visible and carry a src. */
  visible: number;
  /** blob: srcs of layers painted at (near) full opacity. */
  shown: string[];
}

async function sampleFrames(mod: Locator, durationMs: number): Promise<FrameSample[]> {
  const samples: FrameSample[] = [];
  const start = Date.now();
  const deadline = start + durationMs;
  while (Date.now() < deadline) {
    const t = Date.now() - start;
    samples.push({ t, ...await mod.evaluate((el) => {
      let visible = 0;
      const shown: string[] = [];
      for (const img of el.querySelectorAll('img')) {
        const cs = getComputedStyle(img);
        const src = img.getAttribute('src') ?? '';
        if (cs.visibility !== 'visible' || !src) continue;
        const opacity = Number(cs.opacity);
        visible += opacity;
        if (opacity > 0.95) shown.push(src);
      }
      return { visible, shown };
    }) });
    await mod.page().waitForTimeout(50);
  }
  return samples;
}

/** The first slide has loaded and finished its own fade-in; sampling starts here. */
async function settledOnFirstSlide(mod: Locator) {
  const first = mod.locator('img[src^="blob:"]').first();
  await expect(first).toBeAttached();
  await expect(first).toHaveCSS('opacity', '1');
}

function distinctShown(samples: FrameSample[]): Set<string> {
  return new Set(samples.flatMap((s) => s.shown));
}

for (const type of ['photo-slideshow', 'fullscreen-photo'] as const) {
  test(`${type}: the outgoing photo stays up while a slow replacement downloads`, async ({ page, request }) => {
    await stubModuleData(page, { overrides: { backgrounds: [SERVED_A, SERVED_B] } });
    await stubServe(page, ['b.gif'], []);
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(type, { intervalMs: INTERVAL_MS, transition: 'fade' })])],
    }));
    const mod = display.module(type);
    await settledOnFirstSlide(mod);

    // Covers the first advance (1.5s), the stalled download (3s more), and the fade.
    const samples = await sampleFrames(mod, INTERVAL_MS + SLOW_MS + 1500);
    expect(samples.filter((s) => s.visible <= 0.9)).toEqual([]);
    expect(distinctShown(samples).size).toBeGreaterThanOrEqual(2); // b did arrive and was shown
  });

  test(`${type}: a photo that fails to download is skipped without a blank frame`, async ({ page, request }) => {
    await stubModuleData(page, { overrides: { backgrounds: [SERVED_A, SERVED_DEAD, SERVED_B] } });
    await stubServe(page, [], ['dead.gif']);
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(type, { intervalMs: INTERVAL_MS, transition: 'fade' })])],
    }));
    const mod = display.module(type);
    await settledOnFirstSlide(mod);

    // First advance lands on the dead photo; the skip fires 2s later and b loads.
    const samples = await sampleFrames(mod, INTERVAL_MS + 2000 + 2500);
    expect(samples.filter((s) => s.visible <= 0.9)).toEqual([]);
    expect(distinctShown(samples).size).toBeGreaterThanOrEqual(2); // a, then b; never a gap
  });
}
