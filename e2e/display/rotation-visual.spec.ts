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
 * src assertion.
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
