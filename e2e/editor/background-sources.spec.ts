import { test, expect } from '../fixtures';
import type { APIRequestContext, Page, Route } from '@playwright/test';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';
import { stubModuleData } from '../helpers/stubs';

/**
 * A rotating background's Sources rows beyond the walls: the library's
 * Pictures mode, Immich filters and picked photos, Unsplash collections and
 * picked photos. The hub's photo routes are stubbed at the browser boundary,
 * so no real Immich or Unsplash is ever asked.
 */

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TINY_PNG_BYTES = Buffer.from(TINY_PNG.split(',')[1], 'base64');
const ALBUM_ID = 'a1b2c3d4';

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function seedSecrets(request: APIRequestContext) {
  for (const [key, value] of [
    ['unsplash_access_key', 'e2e-unsplash'],
    ['immich_api_key', 'e2e-immich'],
    ['immich_url', 'http://immich.local'],
  ]) {
    const res = await request.put('/api/secrets', { data: { key, value } });
    expect(res.ok()).toBe(true);
  }
}

async function seedImage(request: APIRequestContext, directory: string, name: string): Promise<void> {
  const res = await request.post('/api/backgrounds', {
    multipart: { directory, file: { name, mimeType: 'image/png', buffer: TINY_PNG_BYTES } },
  });
  expect(res.ok()).toBe(true);
}

/** A reachable Immich with one album and one named person, and a browse page per collection. */
async function stubImmich(page: Page) {
  await page.route('**/api/immich/validate*', (route) => json(route, { reachable: true, authenticated: true, version: '3.0.1' }));
  await page.route('**/api/immich/albums*', (route) => json(route, [{ id: ALBUM_ID, name: 'Summer trip', assetCount: 2 }]));
  await page.route('**/api/immich/people*', (route) => json(route, [{ id: 'e5f6a7b8', name: 'Ava', thumbnailUrl: TINY_PNG }]));
}

/** The picker's browse pages, per kind and collection; the previews answer nothing. */
async function stubBrowse(page: Page) {
  await page.route('**/api/photo-source/browse*', (route) => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get('kind');
    if (kind === 'immich') {
      return json(route, {
        items: url.searchParams.get('collection') === `album:${ALBUM_ID}`
          ? [{ ref: 'aa11', thumbUrl: TINY_PNG }, { ref: 'bb22', thumbUrl: TINY_PNG, favorite: true }]
          : [{ ref: 'cc33', thumbUrl: TINY_PNG }],
        nextPage: null,
      });
    }
    return json(route, {
      items: [{ ref: 'u1', thumbUrl: TINY_PNG, label: 'A lake', credit: { name: 'Taylor' } }, { ref: 'u2', thumbUrl: TINY_PNG, label: 'A hill' }],
      nextPage: null,
    });
  });
}

/** Open the editor on a bare screen with nothing selected, where the Sources rows live. */
async function openSources(page: Page, request: APIRequestContext) {
  await page.route('**/api/backgrounds/rotate*', (route) => json(route, { path: null }));
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } });
}

const rotationOf = async (request: APIRequestContext) => (await getConfig(request)).screens[0].backgroundRotation!;

test.describe('rotation sources', () => {
  test('Library: Pictures mode lists the folders and the chosen pictures become the source', async ({ page, request }) => {
    const folder = `e2e-picks-${Date.now()}`;
    await seedImage(request, folder, 'one.png');
    await seedImage(request, folder, 'two.png');
    await page.route('**/api/photo-source/media*', (route) => json(route, []));
    await openSources(page, request);

    await autosaved(page, async () => page.getByRole('checkbox', { name: 'Library' }).check());
    await autosaved(page, async () => page.getByTestId('library-mode-pictures').click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'library', folder: '', pictures: [] }]);
    await expect(page.getByTestId('source-note-library')).toHaveText('Pick some pictures');
    await expect(page.getByTestId('background-mode')).toHaveText('Fixed background');

    await page.getByTestId('library-picked-pictures').getByLabel('Folder').selectOption(folder);
    await autosaved(page, async () => page.getByTestId(`library-pick-${folder}/one.png`).click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'library', folder: '', pictures: [`${folder}/one.png`] }]);
    await expect(page.getByTestId('background-mode')).toHaveText('Showing one picture');

    await autosaved(page, async () => page.getByTestId(`library-pick-${folder}/two.png`).click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'library', folder: '', pictures: [`${folder}/one.png`, `${folder}/two.png`] }]);
    await expect(page.getByTestId('background-mode')).toHaveText('Rotating between the selected sources');

    // Back to Folder mode asks before the picks go; the folder stands.
    await page.getByTestId('library-mode-folder').click();
    await expect(page.getByRole('dialog')).toContainText('forgets the 2 pictures you picked here');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'library', folder: '', pictures: [`${folder}/one.png`, `${folder}/two.png`] }]);
    await page.getByTestId('library-mode-folder').click();
    await autosaved(page, async () => page.getByRole('dialog').getByRole('button', { name: 'Switch' }).click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'library', folder: '' }]);

    await putConfig(request, baseConfig());
    await request.delete('/api/backgrounds/directories', { data: { path: folder } }).catch(() => {});
  });

  test('Immich: any-of filters, a person left out, then photos picked one by one', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    await seedSecrets(request);
    await stubImmich(page);
    await stubBrowse(page);
    await page.route('**/api/photo-source/media*', (route) => json(route, []));
    await openSources(page, request);

    await autosaved(page, async () => page.getByRole('checkbox', { name: 'Immich' }).check());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'immich' }]);
    await expect(page.getByTestId('background-mode')).toHaveText('Rotating between the selected sources');

    const albums = page.getByTestId('immich-albums');
    await autosaved(page, async () => albums.getByRole('checkbox', { name: 'Summer trip (2)' }).check());
    await autosaved(page, async () => page.getByTestId('immich-people').getByRole('checkbox', { name: 'Ava' }).check());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'immich', albumIds: [ALBUM_ID], personIds: ['e5f6a7b8'] }]);
    // Someone shown cannot also be left out: the leave-out list offers the rest.
    await expect(page.getByTestId('immich-exclude').getByRole('checkbox', { name: 'Ava' })).toHaveCount(0);
    await autosaved(page, async () => page.getByTestId('immich-people').getByRole('checkbox', { name: 'Ava' }).uncheck());
    await autosaved(page, async () => page.getByTestId('immich-exclude').getByRole('checkbox', { name: 'Ava' }).check());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'immich', albumIds: [ALBUM_ID], excludePersonIds: ['e5f6a7b8'] }]);

    // Pictures mode starts from nothing picked and says so; the filters stay on the entry.
    await autosaved(page, async () => page.getByTestId('immich-mode-pictures').click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'immich', albumIds: [ALBUM_ID], excludePersonIds: ['e5f6a7b8'], assetIds: [] }]);
    await expect(page.getByTestId('source-note-immich')).toHaveText('Pick some photos');
    await expect(page.getByTestId('background-mode')).toHaveText('Fixed background');

    const picker = page.getByTestId('immich-picked-pictures');
    await picker.getByLabel('Album').selectOption(`album:${ALBUM_ID}`);
    await expect(picker.locator('[data-testid^="immich-pick-"]')).toHaveCount(2);
    await autosaved(page, async () => picker.getByTestId('immich-pick-bb22').click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'immich', albumIds: [ALBUM_ID], excludePersonIds: ['e5f6a7b8'], assetIds: ['bb22'] }]);
    await expect(page.getByTestId('background-mode')).toHaveText('Showing one picture');
    await autosaved(page, async () => picker.getByTestId('immich-pick-aa11').click());
    await expect(page.getByTestId('background-mode')).toHaveText('Rotating between the selected sources');
    // Clicking a picked tile takes it out again.
    await autosaved(page, async () => picker.getByTestId('immich-pick-bb22').click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'immich', albumIds: [ALBUM_ID], excludePersonIds: ['e5f6a7b8'], assetIds: ['aa11'] }]);

    expect(handle.externalHits).toEqual([]);
  });

  test('Unsplash: search words, then a collection, then picked photos, each mode keeping the others on the entry', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    await seedSecrets(request);
    await stubBrowse(page);
    // The collection check asks the media route for one photo of the collection.
    await page.route('**/api/photo-source/media*', (route) => {
      const url = new URL(route.request().url());
      return json(route, url.searchParams.get('collections') === 'abc123' ? [{ url: TINY_PNG, type: 'image' }] : []);
    });
    await openSources(page, request);

    await autosaved(page, async () => page.getByRole('checkbox', { name: 'Unsplash' }).check());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'unsplash', query: 'nature landscape' }]);

    await autosaved(page, async () => page.getByTestId('unsplash-mode-collections').click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'unsplash', query: 'nature landscape', collections: [] }]);
    await expect(page.getByTestId('source-note-unsplash')).toBeVisible();
    await expect(page.getByTestId('background-mode')).toHaveText('Fixed background');

    await page.getByTestId('unsplash-collections').getByLabel('Collection').fill('https://unsplash.com/collections/abc123/sunsets');
    await autosaved(page, async () => page.getByTestId('unsplash-collections').getByRole('button', { name: 'Add' }).click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'unsplash', query: 'nature landscape', collections: ['abc123'] }]);
    await expect(page.getByTestId('unsplash-collection-abc123')).toContainText('Collection found');
    await expect(page.getByTestId('background-mode')).toHaveText('Rotating between the selected sources');

    await autosaved(page, async () => page.getByTestId('unsplash-mode-pictures').click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'unsplash', query: 'nature landscape', collections: ['abc123'], photoIds: [] }]);
    const picker = page.getByTestId('unsplash-picked-pictures');
    await expect(picker.locator('[data-testid^="unsplash-pick-"]')).toHaveCount(2);
    await autosaved(page, async () => picker.getByTestId('unsplash-pick-u1').click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'unsplash', query: 'nature landscape', collections: ['abc123'], photoIds: ['u1'] }]);
    await expect(page.getByTestId('background-mode')).toHaveText('Showing one picture');

    // Back to words asks first (a pick would be lost), then the picks and the collection go and the words stand.
    await page.getByTestId('unsplash-mode-words').click();
    await expect(page.getByRole('dialog')).toContainText('forgets the picture you picked here');
    await autosaved(page, async () => page.getByRole('dialog').getByRole('button', { name: 'Switch' }).click());
    expect((await rotationOf(request)).sources).toEqual([{ kind: 'unsplash', query: 'nature landscape' }]);

    expect(handle.externalHits).toEqual([]);
  });
});
