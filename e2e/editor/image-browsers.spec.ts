import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { selectModule, autosaved, moduleConfig } from '../helpers/editor';
import { stubModuleData } from '../helpers/stubs';

/**
 * Background/image browsers, all stub-driven at the browser boundary. Every
 * browser fetches its data client-side (editorFetch → an internal /api/* proxy
 * route), so `page.route` intercepts the call before the proxy's own upstream
 * fetch can fire — the stubbed /api/* response stands in for the whole chain,
 * and the `stubModuleData` external-block catch-all proves no real upstream was
 * reached (asserted via `externalHits`).
 *
 * Entry points were read from the sources rather than guessed:
 *  - UnsplashBrowser / NasaBrowser / ImmichBrowser render inside BackgroundPicker,
 *    which is the PropertyPanel empty-state "Background" accordion (no module
 *    selected). Each writes the chosen image to `screen.backgroundImage`.
 *  - ImageBrowserModal opens from the image module's Library tab and writes the
 *    chosen path to the module's `config.src`.
 */

// 1x1 transparent PNG. Used as thumb `src` so grids render without any external
// image load (data: URIs are allowed through the external-block catch-all).
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TINY_PNG_BYTES = Buffer.from(TINY_PNG.split(',')[1], 'base64');

/** Seed the API keys the browsers gate their UI on (checked via GET /api/secrets). */
async function seedImageSecrets(request: APIRequestContext) {
  for (const [key, value] of [
    ['unsplash_access_key', 'e2e-unsplash'],
    ['nasa_api_key', 'e2e-nasa'],
    ['immich_api_key', 'e2e-immich'],
    ['immich_url', 'http://immich.local'],
  ]) {
    const res = await request.put('/api/secrets', { data: { key, value } });
    expect(res.ok()).toBe(true);
  }
}

/** Open the editor in its empty (no-module) state so the Background accordion shows. */
async function openBackgroundPicker(page: Page, request: APIRequestContext) {
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'Screen 1', [textModule('BG')])],
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.getByText('Select a module to edit')).toBeVisible();
  // The Background source tabs live in the (default-open) Background accordion.
  await expect(page.getByRole('button', { name: 'NASA', exact: true })).toBeVisible();
}

test.describe('Background source browsers (PropertyPanel Background picker)', () => {
  test.beforeEach(async ({ request }) => {
    await seedImageSecrets(request);
  });

  test('Unsplash: searching renders results and picking persists backgroundImage', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    const SAVED = '/api/backgrounds/serve?file=unsplash-u1.jpg';
    // GET = search results; POST = download-to-local, returns the served path.
    await page.route('**/api/unsplash*', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ path: SAVED }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          photos: [{
            id: 'u1', description: 'Sunset Peak', thumb: TINY_PNG, small: TINY_PNG,
            regular: TINY_PNG, full: TINY_PNG, raw: TINY_PNG,
            authorName: 'Ansel', authorUrl: '', downloadUrl: '',
          }],
          totalPages: 1,
        }),
      });
    });

    await openBackgroundPicker(page, request);

    // Unsplash is the default source tab; its browser auto-runs the first
    // category search on mount.
    const photo = page.getByRole('img', { name: 'Sunset Peak' });
    await expect(photo).toBeVisible();
    await autosaved(page, async () => { await photo.click(); });

    await expect
      .poll(async () => (await getConfig(request)).screens[0].backgroundImage)
      .toBe(SAVED);
    expect(handle.externalHits).toEqual([]);
  });

  test('Unsplash: a failed search shows the kid-friendly error message', async ({ page, request }) => {
    await stubModuleData(page, { blockExternal: true });
    await page.route('**/api/unsplash*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
    );

    await openBackgroundPicker(page, request);

    // ImageSearchBrowser swallows the thrown error into a plain message.
    await expect(page.getByText('Failed to load images')).toBeVisible();
  });

  test('NASA: Picture-of-the-Day results render and picking persists backgroundImage', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    const SAVED = '/api/backgrounds/serve?file=nasa-n1.jpg';
    await page.route('**/api/nasa*', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ path: SAVED }) });
      }
      // `hdurl` present so the save path skips the /api/nasa/asset lookup.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          photos: [{ id: 'n1', title: 'Orion Nebula', description: '', date: '2024-01-01', thumb: TINY_PNG, hdurl: TINY_PNG }],
          totalPages: 1,
        }),
      });
    });

    await openBackgroundPicker(page, request);
    await page.getByRole('button', { name: 'NASA', exact: true }).click();

    const photo = page.getByRole('img', { name: 'Orion Nebula' });
    await expect(photo).toBeVisible();
    await autosaved(page, async () => { await photo.click(); });

    await expect
      .poll(async () => (await getConfig(request)).screens[0].backgroundImage)
      .toBe(SAVED);
    expect(handle.externalHits).toEqual([]);
  });

  test('Immich: album photos render and picking uploads + persists backgroundImage', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    const SAVED = '/api/backgrounds/serve?file=immich-asset-9.jpg';
    await page.route('**/api/immich/albums*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'al1', name: 'Family', assetCount: 2 }]) }),
    );
    await page.route('**/api/immich/photos*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(['/api/immich/serve?assetId=asset-9&size=preview']) }),
    );
    // Serves both the thumbnail <img> and the binary the save handler re-fetches.
    await page.route('**/api/immich/serve*', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_PNG_BYTES }),
    );
    // The Immich picker uploads the fetched binary to /api/backgrounds (POST).
    await page.route('**/api/backgrounds', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ path: SAVED }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await openBackgroundPicker(page, request);
    await page.getByRole('button', { name: 'Immich', exact: true }).click();

    const photo = page.locator('button:has(img[src*="asset-9"])');
    await expect(photo).toBeVisible();
    await autosaved(page, async () => { await photo.click(); });

    await expect
      .poll(async () => (await getConfig(request)).screens[0].backgroundImage)
      .toBe(SAVED);
    expect(handle.externalHits).toEqual([]);
  });
});

test.describe('ImageBrowserModal (image module Library picker)', () => {
  test('browsing the local library and picking an image persists config.src', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    const PICKED = '/api/backgrounds/serve?file=beach.jpg';
    // Directory tree + media list the modal's local tab reads.
    await page.route('**/api/backgrounds/directories*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ directories: [{ name: 'All Photos', path: '', imageCount: 2 }] }) }),
    );
    await page.route('**/api/backgrounds/serve*', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_PNG_BYTES }),
    );
    // The library fetches the typed media list; the video entry must be
    // filtered OUT of the pick-image grid.
    await page.route('**/api/backgrounds?media=both*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { url: PICKED, type: 'image' },
        { url: '/api/backgrounds/serve?file=forest.jpg', type: 'image' },
        { url: '/api/backgrounds/serve?file=clip.mp4', type: 'video' },
      ]) }),
    );

    await selectModule(page, request, buildModuleInstance('image'));

    // The image config defaults to the URL tab; switch to Library, then browse.
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('button', { name: 'Browse Library...' }).click();

    await expect(page.getByRole('heading', { name: 'Image Library' })).toBeVisible();
    await expect(page.locator('[data-media-type="video"]')).toHaveCount(0);
    // Pick the first thumbnail, then confirm.
    await page.locator('button:has(img[src*="beach.jpg"])').click();
    await autosaved(page, async () => {
      await page.getByRole('button', { name: 'Select Image' }).click();
    });

    expect((await moduleConfig(request, 'image')).src).toBe(PICKED);
    expect(handle.externalHits).toEqual([]);
  });

  test('pick-video mode lists only videos and picking one persists config.file', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    await page.route('**/api/backgrounds/directories*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ directories: [{ name: 'All Photos', path: '', imageCount: 2 }] }) }),
    );
    await page.route('**/api/backgrounds/serve*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
    );
    await page.route('**/api/backgrounds?media=both*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { url: '/api/backgrounds/serve?file=beach.jpg', type: 'image' },
        { url: '/api/backgrounds/serve?file=family-clip.mp4&mt=e2e-token', type: 'video' },
      ]) }),
    );
    // The standalone video module itself resolves through media=videos.
    await page.route('**/api/backgrounds?media=videos*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { url: '/api/backgrounds/serve?file=family-clip.mp4&mt=e2e-token', type: 'video' },
      ]) }),
    );

    await selectModule(page, request, buildModuleInstance('video'));
    await page.getByRole('button', { name: 'Browse Library...' }).click();

    await expect(page.getByRole('heading', { name: 'Video Library' })).toBeVisible();
    // Images are filtered out of the pick-video grid; the video tile shows.
    await expect(page.locator('img[src*="beach.jpg"]')).toHaveCount(0);
    await page.locator('[data-media-type="video"] button:has(video)').click();
    await autosaved(page, async () => {
      await page.getByRole('button', { name: 'Select Video' }).click();
    });

    // Config stores the file PATH, not the token-bearing serve URL.
    expect((await moduleConfig(request, 'video')).file).toBe('family-clip.mp4');
    expect(handle.externalHits).toEqual([]);
  });

  test('manage-directory mode shows video tiles alongside images', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    await page.route('**/api/backgrounds/directories*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ directories: [{ name: 'All Photos', path: '', imageCount: 2 }] }) }),
    );
    await page.route('**/api/backgrounds/serve*', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_PNG_BYTES }),
    );
    await page.route('**/api/backgrounds?media=both*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { url: '/api/backgrounds/serve?file=beach.jpg', type: 'image' },
        { url: '/api/backgrounds/serve?file=family-clip.mp4', type: 'video' },
      ]) }),
    );

    await selectModule(page, request, buildModuleInstance('photo-slideshow'));
    await page.getByRole('button', { name: 'Browse...', exact: true }).click();

    // The mixed management view is media-branded, not image-branded.
    await expect(page.getByRole('heading', { name: 'Media Library' })).toBeVisible();
    await expect(page.getByText('All Photos & Videos').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
    await expect(page.locator('img[src*="beach.jpg"]')).toBeVisible();
    await expect(page.locator('[data-media-type="video"]')).toHaveCount(1);
    // Both media kinds are counted in the toolbar summary.
    await expect(page.getByText('1 photo, 1 video')).toBeVisible();
    expect(handle.externalHits).toEqual([]);
  });
});
