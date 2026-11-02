import { test, expect } from '../fixtures';
import type { APIRequestContext, Page, Route } from '@playwright/test';
import type { Screen } from '@/types/config';
import { clearSecrets, getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { selectModule, autosaved, moduleConfig } from '../helpers/editor';
import { stubModuleData } from '../helpers/stubs';

/**
 * The Image Library (src/components/editor/picture-picker), the one window
 * every single-picture spot opens, all stub-driven at the browser boundary.
 * Each source tab reads `/api/photo-source/browse` and copies the chosen
 * picture through `/api/photo-source/import`, so `page.route` stands in for
 * the whole chain, and the `stubModuleData` external-block catch-all proves
 * no real upstream was reached (asserted via `externalHits`).
 *
 * Entry points:
 *  - A screen's background: the Background accordion of the PropertyPanel's
 *    empty state (no module selected) has a picture field whose "Choose a
 *    picture" opens the picker with the built-in backgrounds as its first
 *    tab. A pick writes `screen.backgroundImage` and turns rotation off.
 *  - The image module's Library tab opens it in pick-image mode; the video
 *    module and a slideshow's folder Browse open its library-only modes.
 */

// 1x1 transparent PNG. Used as thumb `src` so grids render without any external
// image load (data: URIs are allowed through the external-block catch-all).
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TINY_PNG_BYTES = Buffer.from(TINY_PNG.split(',')[1], 'base64');

const ALBUM_ID = 'a1b2c3d4';

/** Seed the API keys the picker's tabs check (GET /api/secrets). */
async function seedImageSecrets(request: APIRequestContext) {
  for (const [key, value] of [
    ['unsplash_access_key', 'e2e-unsplash'],
    ['immich_api_key', 'e2e-immich'],
    ['immich_url', 'http://immich.local'],
  ]) {
    const res = await request.put('/api/secrets', { data: { key, value } });
    expect(res.ok()).toBe(true);
  }
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Stub the picker's two routes. `browse` answers per source and sidebar
 * entry; every import answers `saved` and is recorded, so a spec can check
 * what was asked to be copied.
 */
async function stubPicker(page: Page, saved: string, browse: (url: URL) => unknown) {
  const imports: unknown[] = [];
  await page.route('**/api/photo-source/browse*', (route) => json(route, browse(new URL(route.request().url()))));
  await page.route('**/api/photo-source/import', (route) => {
    imports.push(route.request().postDataJSON());
    return json(route, { path: saved, file: saved.replace(/^.*file=/, ''), reused: false }, 201);
  });
  return imports;
}

/** Stub a reachable Immich server with one album and one named person. */
async function stubImmich(page: Page, albums: { status: number; body: unknown } = { status: 200, body: [{ id: ALBUM_ID, name: 'Summer trip', assetCount: 2 }] }) {
  await page.route('**/api/immich/validate*', (route) => json(route, { reachable: true, authenticated: true, version: '3.0.1' }));
  await page.route('**/api/immich/albums*', (route) => json(route, albums.body, albums.status));
  await page.route('**/api/immich/people*', (route) =>
    json(route, [{ id: 'p1', name: 'Ava', thumbnailUrl: TINY_PNG }]),
  );
}

/** Open the editor on a screen (no module selected) and open the Image Library from its picture field. */
async function openBackgroundPicker(page: Page, request: APIRequestContext, screen: Partial<Screen> = {}) {
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'Screen 1', [textModule('BG')], screen)],
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.getByText('Select a module to edit')).toBeVisible();
  await page.getByTestId('background-choose').click();
  const library = page.getByRole('dialog', { name: 'Image Library' });
  await expect(library).toBeVisible();
  return library;
}

test.describe('the Image Library from a screen background', () => {
  test.beforeEach(async ({ request }) => {
    await seedImageSecrets(request);
  });

  test('every source is a tab, the built-in backgrounds first', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    const library = await openBackgroundPicker(page, request);
    await expect(library.getByRole('tab')).toHaveText(['Built-in', 'Local', 'Immich', 'Unsplash', 'NASA']);
    await expect(library.getByTestId('picker-tab-builtin')).toHaveAttribute('aria-selected', 'true');
    // Every key is seeded, so nothing is locked.
    for (const id of ['immich', 'unsplash', 'nasa']) {
      await expect(library.getByTestId(`picker-tab-${id}`)).not.toHaveAttribute('title', /./);
    }
    expect(handle.externalHits).toEqual([]);
  });

  test('a built-in pick persists backgroundImage and turns rotation off', async ({ page, request }) => {
    await stubModuleData(page, { blockExternal: true });
    await page.route('**/api/backgrounds/rotate*', (route) => json(route, { path: null }));
    const library = await openBackgroundPicker(page, request, {
      backgroundRotation: { enabled: true, intervalMinutes: 60, photoSource: { kind: 'library', folder: '' } },
    });
    await library.getByTestId('builtin-group-color').click();
    await library.getByTestId('starter-picture-ocean').click();
    await autosaved(page, async () => {
      await library.getByTestId('picker-confirm').click();
    });
    const screen = (await getConfig(request)).screens[0];
    expect(screen.backgroundImage).toBe('/starter-backgrounds/ocean.svg');
    expect(screen.backgroundRotation?.enabled).toBe(false);
    await expect(page.getByTestId('background-picture-name')).toHaveText('Ocean');
  });

  test('Immich: an album\'s photos browse newest first, and a pick is copied and persisted', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    await stubImmich(page);
    const SAVED = '/api/backgrounds/serve?file=immich%2Fimmich-asset2.jpg';
    const imports = await stubPicker(page, SAVED, (url) => ({
      items: url.searchParams.get('collection') === `album:${ALBUM_ID}`
        ? [{ ref: 'asset1', thumbUrl: TINY_PNG }, { ref: 'asset2', thumbUrl: TINY_PNG, favorite: true }]
        : [{ ref: 'asset9', thumbUrl: TINY_PNG }],
      nextPage: null,
    }));
    await page.route('**/api/backgrounds/serve*', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG_BYTES }));

    const library = await openBackgroundPicker(page, request);
    await library.getByTestId('picker-tab-immich').click();
    await expect(library.getByTestId('immich-collection-all')).toHaveAttribute('aria-pressed', 'true');
    await library.getByTestId(`immich-album-${ALBUM_ID}`).click();
    await expect(library.getByTestId('picker-bar-label')).toContainText('Summer trip');
    await expect(library.locator('[data-ref]')).toHaveCount(2);
    await library.locator('[data-ref="asset2"]').click();
    await expect(library.getByTestId('picker-hint')).toContainText("library's Immich folder");
    await autosaved(page, async () => {
      await library.getByTestId('picker-confirm').click();
    });

    expect(imports).toEqual([{ kind: 'immich', ref: 'asset2' }]);
    expect((await getConfig(request)).screens[0].backgroundImage).toBe(SAVED);
    expect(handle.externalHits).toEqual([]);
  });

  test('Immich: a key that cannot see albums says which box to tick', async ({ page, request }) => {
    await stubModuleData(page, { blockExternal: true });
    await stubImmich(page, { status: 403, body: { error: 'missing-permission', permission: 'album.read' } });
    await stubPicker(page, '', () => ({ items: [{ ref: 'asset9', thumbUrl: TINY_PNG }], nextPage: null }));

    const library = await openBackgroundPicker(page, request);
    await library.getByTestId('picker-tab-immich').click();
    const note = library.getByTestId('immich-permission-note');
    await expect(note).toHaveAttribute('data-permission', 'album.read');
    await expect(note).toContainText('Albums are hidden.');
    await expect(note).toContainText('tick album.read');
    // Photos still browse with the albums hidden.
    await expect(library.locator('[data-ref]')).toHaveCount(1);
  });

  test('Unsplash: ideas and a search browse, and a pick credits the photographer and persists', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    const SAVED = '/api/backgrounds/serve?file=unsplash%2Funsplash-u2.jpg';
    const searches: string[] = [];
    const imports = await stubPicker(page, SAVED, (url) => {
      searches.push(url.searchParams.get('query') ?? '');
      return { items: [{ ref: 'u2', thumbUrl: TINY_PNG, label: 'Sunset Peak', credit: { name: 'Ansel' } }], nextPage: null };
    });

    const library = await openBackgroundPicker(page, request);
    await library.getByTestId('picker-tab-unsplash').click();
    await expect(library.locator('[data-ref="u2"]')).toBeVisible();
    // The first idea searches its English words.
    expect(searches[0]).toBe('nature landscape');
    await library.getByTestId('picker-search').fill('lighthouse');
    await library.getByRole('button', { name: 'Search', exact: true }).click();
    await expect.poll(() => searches.at(-1)).toBe('lighthouse');
    await expect(library.getByTestId('unsplash-idea-nature')).toHaveAttribute('aria-pressed', 'false');

    await library.locator('[data-ref="u2"]').click();
    await expect(library.getByTestId('picker-hint')).toHaveText("Photo by Ansel on Unsplash. A copy goes into your library's Unsplash folder.");
    await autosaved(page, async () => {
      await library.getByTestId('picker-confirm').click();
    });
    expect(imports).toEqual([{ kind: 'unsplash', ref: 'u2' }]);
    expect((await getConfig(request)).screens[0].backgroundImage).toBe(SAVED);
    expect(handle.externalHits).toEqual([]);
  });

  test('Unsplash: a failed copy says so in the footer and keeps the window open', async ({ page, request }) => {
    await stubModuleData(page, { blockExternal: true });
    await page.route('**/api/photo-source/browse*', (route) => json(route, { items: [{ ref: 'u2', thumbUrl: TINY_PNG }], nextPage: null }));
    await page.route('**/api/photo-source/import', (route) => json(route, { error: 'Could not search Unsplash' }, 502));

    const library = await openBackgroundPicker(page, request);
    await library.getByTestId('picker-tab-unsplash').click();
    await library.locator('[data-ref="u2"]').click();
    await library.getByTestId('picker-confirm').click();
    // The household's language, never the hub's English sentence.
    await expect(library.getByTestId('picker-hint')).toHaveText("Couldn't copy this picture. Try again.");
    await expect(library).toBeVisible();
    expect((await getConfig(request)).screens[0].backgroundImage).toBe('');
  });

  test("Unsplash: a copy refused for the hourly limit says to wait", async ({ page, request }) => {
    await stubModuleData(page, { blockExternal: true });
    await page.route('**/api/photo-source/browse*', (route) => json(route, { items: [{ ref: 'u3', thumbUrl: TINY_PNG }], nextPage: null }));
    await page.route('**/api/photo-source/import', (route) => json(route, { error: 'unsplash-rate-limit' }, 429));

    const library = await openBackgroundPicker(page, request);
    await library.getByTestId('picker-tab-unsplash').click();
    await library.locator('[data-ref="u3"]').click();
    await library.getByTestId('picker-confirm').click();
    await expect(library.getByTestId('picker-hint')).toContainText('50 searches an hour');
  });

  test('NASA: searching the image library picks and persists', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    const SAVED = '/api/backgrounds/serve?file=nasa%2Fnasa-PIA1.jpg';
    const asked: string[] = [];
    const imports = await stubPicker(page, SAVED, (url) => {
      asked.push(`${url.searchParams.get('collection')}:${url.searchParams.get('query') ?? ''}`);
      return { items: [{ ref: 'image:PIA1', thumbUrl: TINY_PNG, label: 'Crab Nebula', secondary: '2011-08-10' }], nextPage: null };
    });

    const library = await openBackgroundPicker(page, request);
    await library.getByTestId('picker-tab-nasa').click();
    // Picture of the day comes first; it needs no key.
    await expect(library.getByTestId('nasa-apod')).toHaveAttribute('aria-pressed', 'true');
    await library.getByTestId('nasa-idea-nebula').click();
    await expect.poll(() => asked.at(-1)).toBe('search:nebula');
    await library.locator('[data-ref="image:PIA1"]').click();
    await autosaved(page, async () => {
      await library.getByTestId('picker-confirm').click();
    });
    expect(imports).toEqual([{ kind: 'nasa', ref: 'image:PIA1' }]);
    expect((await getConfig(request)).screens[0].backgroundImage).toBe(SAVED);
    expect(handle.externalHits).toEqual([]);
  });
});

test.describe('a rotating background\'s source', () => {
  test('offers every source, and warns when the chosen one has no key', async ({ page, request }) => {
    await page.route('**/api/backgrounds/rotate*', (route) => json(route, { path: null }));
    await clearSecrets(request, ['unsplash_access_key', 'immich_api_key', 'immich_url', 'microsoft_client_id']);
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [textModule('BG')], {
        backgroundRotation: { enabled: true, intervalMinutes: 60, photoSource: { kind: 'library', folder: '' } },
      })],
    }));
    await page.goto('/editor');
    await expect(page.getByText('Select a module to edit')).toBeVisible();

    const source = page.getByLabel('Photo Source');
    await expect(source.locator('option')).toHaveCount(6);
    await expect(page.getByTestId('photo-source-key-missing')).toHaveCount(0);
    await autosaved(page, async () => {
      await source.selectOption('nasa');
    });
    const rotation = (await getConfig(request)).screens[0].backgroundRotation!;
    expect(rotation.photoSource).toEqual({ kind: 'nasa' });
    // One new picture a day: checking hourly gains nothing.
    expect(rotation.intervalMinutes).toBe(240);
    // NASA needs no key; Unsplash does, and says so under the list.
    await expect(page.getByTestId('photo-source-key-missing')).toHaveCount(0);
    await source.selectOption('unsplash');
    await expect(page.getByTestId('photo-source-key-missing')).toBeVisible();
    // A background is a still picture: no video choice, no per-refresh count.
    await expect(page.locator('select:has(option[value="videos"])')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Photos per Refresh' })).toHaveCount(0);
  });
});

test.describe('the Image Library in its library-only modes', () => {
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
    // Videos come from the library only, so there are no source tabs.
    await expect(page.getByRole('tab')).toHaveCount(0);
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

    // The mixed management view is media-branded, not image-branded, and
    // chooses a folder of the library, so it has no source tabs.
    await expect(page.getByRole('heading', { name: 'Media Library' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByText('All Photos & Videos').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
    await expect(page.locator('img[src*="beach.jpg"]')).toBeVisible();
    await expect(page.locator('[data-media-type="video"]')).toHaveCount(1);
    // Both media kinds are counted in the toolbar summary.
    await expect(page.getByText('1 photo, 1 video')).toBeVisible();
    expect(handle.externalHits).toEqual([]);
  });
});
