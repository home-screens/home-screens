import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { stubModuleData } from '../helpers/stubs';
import type { ModuleInstance } from '@/types/config';

/**
 * Coverage for `usePrefetchNextScreen` (src/components/display/usePrefetchNextScreen.ts).
 *
 * The hook schedules `prefetchScreen(next)` at `max(currentDurationMs - 5000, 0)`
 * after a screen mounts, so the next screen's module data is fetched ~5s before
 * rotation while the current screen is still on-screen. We prove this at the
 * network boundary: a `news` module lives on the *next* screen, and every
 * `/api/news` request is counted. Because only the current screen mounts
 * (ScreenRotator mounts one screen at a time), the only ways `/api/news` can
 * fire while screen one is visible are the prefetch timer and the one-off
 * boot warm-up (`useBootWarmup`, ~400ms after mount) — both share
 * `displayCache`, so between them a URL is fetched once.
 *
 * We use `news` (not weather) deliberately: weather is absent from
 * FETCH_KEY_REGISTRY (src/lib/fetch-keys.ts) and is never prefetched, whereas
 * `news` is registered and `newsUrl` always builds a `/api/news?feed=...` URL
 * that `stubModuleData`'s `api/news` glob serves from a fixture.
 *
 * `useFetchData` and `prefetchScreen` share `displayCache`, and the render path
 * checks the cache inside its effect — so a screen whose data was prefetched
 * (fresh) reuses the cached value and issues no second request. That lets a
 * plain request count cleanly separate "prefetched" from "fetched on render".
 */

// Mirrors the constant in usePrefetchNextScreen.ts (`currentDurationMs - 5000`).
// The gap between the prefetch firing and rotation is always exactly this,
// regardless of the chosen duration.
const PREFETCH_LEAD_MS = 5000;

/** A rotation duration that leaves a comfortable, fixed 5s window between the
 *  prefetch (at DURATION - 5000) and the rotation (at DURATION). */
const DURATION_MS = PREFETCH_LEAD_MS + 3000; // prefetch ~3s in, rotation ~8s in

/** A news module for the *next* screen. Renders fixture content when it becomes
 *  current; its `/api/news` request is what we count. */
function newsModule(overrides: Partial<ModuleInstance> = {}): ModuleInstance {
  return { ...buildModuleInstance('news'), id: 'news-next', ...overrides };
}

/**
 * Stubs all module data (zero real upstream calls) and layers a counting route
 * over `/api/news` that records each request's arrival time, then falls through
 * to the fixture stub. Registered last, so Playwright matches it first; the
 * `route.fallback()` hands off to `stubModuleData`'s earlier `api/news`
 * handler for fulfillment.
 */
async function countNewsRequests(page: Parameters<typeof stubModuleData>[0]) {
  const handle = await stubModuleData(page);
  const timestamps: number[] = [];
  await page.route('**/api/news*', async (route) => {
    timestamps.push(Date.now());
    await route.fallback();
  });
  return { timestamps, externalHits: handle.externalHits };
}

test('prefetches the next screen while the current screen is still visible', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('one', 'One', [textModule('SCREEN ONE')]),
      makeScreen('two', 'Two', [newsModule(), textModule('SCREEN TWO')]),
    ],
    settings: { rotationIntervalMs: DURATION_MS },
  }));

  const news = await countNewsRequests(page);
  await page.goto('/display');
  await expect(page.getByText('SCREEN ONE')).toBeVisible();

  // The prefetch timer fires ~3s after mount (DURATION - 5000). Wait for the
  // request; the timeout stays under the ~8s rotation so we observe it strictly
  // within screen one's window.
  await expect.poll(() => news.timestamps.length, { timeout: 7000, message: 'expected a prefetch /api/news request' })
    .toBeGreaterThan(0);

  // The request arrived while screen one is still current and screen two has not
  // mounted — so it could only have come from prefetch. There is a full 5s gap
  // before rotation, so these two checks resolve well before screen two shows.
  await expect(page.getByText('SCREEN ONE')).toBeVisible();
  await expect(page.getByText('SCREEN TWO')).toBeHidden();

  // When rotation lands on screen two, its news module reuses the prefetched
  // (fresh) cache entry and issues no second request — the count stays at one.
  // The boot warm-up can fire the request within the first second, so the
  // wait here spans the whole rotation window rather than the old 5s gap.
  await expect(page.getByText('SCREEN TWO')).toBeVisible({ timeout: DURATION_MS + 4000 });
  expect(news.timestamps.length).toBe(1);
  expect(news.externalHits).toEqual([]);
});

test('does not prefetch a disabled module on the next screen', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('one', 'One', [textModule('SCREEN ONE')]),
      // The only networked module on screen two is disabled. prefetchScreen's
      // getScreenFetchUrls skips `!isModuleEnabled(mod)`, so it is never fetched
      // ahead of rotation; a sibling text module keeps the screen renderable.
      makeScreen('two', 'Two', [newsModule({ enabled: false }), textModule('SCREEN TWO')]),
    ],
    settings: { rotationIntervalMs: DURATION_MS },
  }));

  const news = await countNewsRequests(page);
  await page.goto('/display');
  await expect(page.getByText('SCREEN ONE')).toBeVisible();

  // Observe past the ~3s prefetch moment but before the ~8s rotation. If the
  // disabled module were prefetched, the request would land in this window.
  await page.waitForTimeout(PREFETCH_LEAD_MS + 1000);
  await expect(page.getByText('SCREEN ONE')).toBeVisible();
  expect(news.timestamps).toEqual([]);
  expect(news.externalHits).toEqual([]);
});

test('a sticky current screen (rotationDurationMs: 0) schedules no next-screen prefetch', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      // Sticky: resolveScreenDuration returns 0, so the hook returns early
      // (`currentDurationMs <= 0`) and never schedules a prefetch.
      makeScreen('sticky', 'Sticky', [textModule('STICKY SCREEN')], { rotationDurationMs: 0 }),
      makeScreen('two', 'Two', [newsModule(), textModule('NEVER SHOWN')]),
    ],
    settings: { rotationIntervalMs: DURATION_MS },
  }));

  const news = await countNewsRequests(page);
  await page.goto('/display');
  await expect(page.getByText('STICKY SCREEN')).toBeVisible();

  // The boot warm-up (useBootWarmup) fetches screen two's news once, ~400ms
  // after mount, whatever the current screen's duration — a tap can still
  // land there. What a sticky screen must NOT do is arm the next-screen
  // prefetch, or advance: past the prefetch moment the count is still the
  // single warm-up request and screen two never mounted.
  await page.waitForTimeout(PREFETCH_LEAD_MS + 1000);
  await expect(page.getByText('STICKY SCREEN')).toBeVisible();
  await expect(page.getByText('NEVER SHOWN')).toBeHidden();
  expect(news.timestamps.length).toBeLessThanOrEqual(1);
  expect(news.externalHits).toEqual([]);
});

test('a single-screen config prefetches nothing', async ({ page, request }) => {
  // With one screen the hook returns early (`screensRef.current.length <= 1`)
  // and ScreenRotator disables its rotation timer. The lone news module fetches
  // for its own render (at mount); the point is that no *additional*
  // prefetch-timed request follows around the ~3s mark and the screen never
  // rotates. We assert the request count is stable across the prefetch window
  // rather than a fixed value — mount can issue one or two near-simultaneous
  // render fetches depending on hydration, but a prefetch would land seconds
  // later and grow the count.
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('solo', 'Solo', [newsModule({ id: 'news-solo' }), textModule('SOLO SCREEN')]),
    ],
    settings: { rotationIntervalMs: DURATION_MS },
  }));

  const news = await countNewsRequests(page);
  await page.goto('/display');
  await expect(page.getByText('SOLO SCREEN')).toBeVisible();

  // Let the render fetch(es) settle (they land within ~100ms of mount).
  await expect.poll(() => news.timestamps.length, { timeout: 4000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  const afterRender = news.timestamps.length;

  // Wait through the moment a prefetch would fire (DURATION - 5000 ~ 3s).
  await page.waitForTimeout(PREFETCH_LEAD_MS + 1000);
  await expect(page.getByText('SOLO SCREEN')).toBeVisible();
  expect(news.timestamps.length).toBe(afterRender);
  expect(news.externalHits).toEqual([]);
});
