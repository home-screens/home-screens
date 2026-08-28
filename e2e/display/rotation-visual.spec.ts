import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { TransitionEffect } from '@/types/config';

/**
 * Display runtime visuals: per-screen background rotation and screen-to-screen
 * transitions.
 *
 * Background rotation: `useBackgroundRotation` polls
 * `/api/backgrounds/rotate?screenId=X` (once immediately on mount, then every
 * 60s) and feeds the returned `path` into ScreenRenderer as the screen's
 * background `<img src>`. We stub that endpoint per screen. The rotated paths
 * are plain (non-`/api/`) URLs so `useAuthImage` returns them verbatim — an
 * `/api/`-served path would be swapped for an opaque blob: URL, defeating the
 * src assertion. The last background test is the exception: real rotation
 * paths ARE `/api/backgrounds/serve?file=...`, and what it asserts is about
 * the blob swap itself, not the src value.
 *
 * Screen transitions: driven by the View Transitions API (ScreenRotator's
 * startScreenTransition). Only the current screen is mounted at a time, so a
 * transition is observable structurally — the incoming screen's content enters
 * the DOM and the outgoing screen's leaves — with no need for pixel sampling.
 * These assert the swap happens and that no effect throws a pageerror.
 */

// 1x1 transparent GIF — the screen's static (pre-rotation) background.
const STATIC_BG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
// Distinct non-/api/ paths the stubbed rotate endpoint hands back per screen.
const ROTATED_A = '/e2e-rotated/photo-a.jpg';
const ROTATED_B = '/e2e-rotated/photo-b.jpg';

function rotatingScreen(id: string, name: string, label: string, query: string) {
  return makeScreen(id, name, [textModule(label)], {
    backgroundImage: STATIC_BG,
    backgroundRotation: { enabled: true, source: 'unsplash', query, intervalMinutes: 1 },
  });
}

test('background rotation replaces the static background with the fetched image', async ({ page, request }) => {
  await page.route('**/api/backgrounds/rotate*', (route) =>
    route.fulfill({ json: { path: ROTATED_A, fresh: true } }),
  );
  await putConfig(request, baseConfig({
    screens: [rotatingScreen('r', 'R', 'ROTATING SCREEN', 'mountains')],
  }));
  await page.goto('/display');
  await expect(page.getByText('ROTATING SCREEN')).toBeVisible();
  // The background advances off the static image to the fetched rotation path.
  await expect(page.locator('img').first()).toHaveAttribute('src', ROTATED_A);
});

test('the background src advances as the display rotates between rotating screens', async ({ page, request }) => {
  await page.route('**/api/backgrounds/rotate*', (route) => {
    const screenId = new URL(route.request().url()).searchParams.get('screenId');
    return route.fulfill({ json: { path: screenId === 'r2' ? ROTATED_B : ROTATED_A, fresh: true } });
  });
  await putConfig(request, baseConfig({
    screens: [
      rotatingScreen('r1', 'R1', 'SCREEN ONE', 'forest'),
      rotatingScreen('r2', 'R2', 'SCREEN TWO', 'ocean'),
    ],
    settings: { rotationIntervalMs: 1500 },
  }));
  await page.goto('/display');
  await expect(page.getByText('SCREEN ONE')).toBeVisible();
  await expect(page.locator('img').first()).toHaveAttribute('src', ROTATED_A);
  // Auto-rotation moves to the second screen, whose own rotation path is shown.
  await expect(page.getByText('SCREEN TWO')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('img').first()).toHaveAttribute('src', ROTATED_B);
});

// 1x1 GIF bytes, served as the background image behind the two /api/ paths below.
const GIF_BYTES = Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64');
const SERVED_A = '/api/backgrounds/serve?file=a.gif';
const SERVED_B = '/api/backgrounds/serve?file=b.gif';

test('the background img stays mounted while a changed background loads', async ({ page, request }) => {
  // ScreenRenderer renders the background as `{backgroundImage && <img>}`, so
  // if useAuthImage drops to undefined mid-swap the element leaves the DOM and
  // the screen flashes its black backdrop on every rotation. The hook holds
  // the previous blob until the replacement is ready; this watches for the gap.
  await page.route('**/api/backgrounds/serve*', async (route) => {
    const file = new URL(route.request().url()).searchParams.get('file');
    if (file === 'b.gif') await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.fulfill({ body: GIF_BYTES, contentType: 'image/gif' });
  });

  const screenWith = (background: string) =>
    baseConfig({ screens: [makeScreen('s', 'S', [textModule('BG SCREEN')], { backgroundImage: background })] });

  await putConfig(request, screenWith(SERVED_A));
  await page.goto('/display');
  await expect(page.getByText('BG SCREEN')).toBeVisible();
  const img = page.locator('img').first();
  await expect(img).toHaveAttribute('src', /^blob:/);
  const before = await img.getAttribute('src');

  // Swap the background; the display picks it up on its 3s config poll, and
  // the replacement's bytes are stalled for another 3s behind the route above.
  await putConfig(request, screenWith(SERVED_B));

  const samples: string[] = [];
  const deadline = Date.now() + 9000;
  let swapped = false;
  while (Date.now() < deadline && !swapped) {
    const src = await page.locator('img').first().getAttribute('src').catch(() => null);
    samples.push(src ?? 'MISSING');
    if (src && src !== before) swapped = true;
    await page.waitForTimeout(50);
  }

  expect(swapped).toBe(true); // the new background did arrive
  expect(samples).not.toContain('MISSING'); // ...and the old one never blanked first
  expect(samples.every((src) => src.startsWith('blob:'))).toBe(true);
});

for (const effect of ['fade', 'slide', 'none'] as const satisfies readonly TransitionEffect[]) {
  test(`screen transition (${effect}) swaps content in and out without a pageerror`, async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await putConfig(request, baseConfig({
      screens: [
        makeScreen('a', 'A', [textModule('SCREEN ALPHA')]),
        makeScreen('b', 'B', [textModule('SCREEN BRAVO')]),
      ],
      settings: { rotationIntervalMs: 1500, transitionEffect: effect, transitionDuration: 0.3 },
    }));
    await page.goto('/display');

    await expect(page.getByText('SCREEN ALPHA')).toBeVisible();
    // Incoming screen enters the DOM.
    await expect(page.getByText('SCREEN BRAVO')).toBeVisible({ timeout: 8000 });
    // Outgoing screen has left (only the current screen is mounted at a time).
    await expect(page.getByText('SCREEN ALPHA')).toBeHidden();

    expect(errors).toEqual([]);
  });
}
