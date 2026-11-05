import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { existsSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { getConfig, postHeartbeat, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, choreChartModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { mp4WithVideo } from '../helpers/video-samples';
import type { ModuleInstance, ScreenConfiguration } from '@/types/config';

/**
 * /remote Photos tab: the hub's photo library from a phone. The tab is gated
 * on a `fullscreen-photo` or `photo-slideshow` module existing in config, and
 * reads the whole library through `/api/backgrounds/inventory`.
 *
 * ISOLATION NOTE: backgrounds are stored on disk under `public/backgrounds`
 * (BACKGROUNDS_DIR), NOT `data/`. The e2e sandbox only gives each worker a
 * private `data/`; every other repo entry, `public/` included, is symlinked,
 * so writes to `public/backgrounds` land in the real repo directory shared by
 * all workers. Every test that touches disk works inside its own uniquely
 * named folders and removes them in afterEach, and picks its folder chip by
 * `data-folder` (other workers' folders show up in the chip row too). The
 * files are gitignored (`public/backgrounds/*`), so `git status` stays clean.
 */

// 1x1 transparent PNG: a real, valid image the upload validator and the
// serve route both accept.
const TINY_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Absolute on-disk path inside the backgrounds store (via the sandbox symlink). */
function bgPath(sandboxDir: string, ...segments: string[]): string {
  return path.join(sandboxDir, 'public', 'backgrounds', ...segments);
}

/** A full-screen photo module on the only screen ("Screen One"), playing `directory`. */
function photoConfig(directory = '', extraModules: ModuleInstance[] = [], screen: Record<string, unknown> = {}): ScreenConfiguration {
  const photo = buildModuleInstance('fullscreen-photo', { photoSource: { kind: 'library', folder: directory } });
  return baseConfig({ screens: [makeScreen('screen-0', 'Screen One', [photo, ...extraModules], screen)] });
}

/** Slug that survives the folder-name sanitizer (only [A-Za-z0-9._-] kept). */
function uniqueFolder(): string {
  return `e2e-photos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Seed an image through the real upload API, the way the phone adds one. */
async function seedImage(request: APIRequestContext, directory: string, name: string): Promise<void> {
  const res = await request.post('/api/backgrounds', {
    multipart: { directory, file: { name, mimeType: 'image/png', buffer: TINY_PNG_BYTES } },
  });
  expect(res.ok()).toBe(true);
}

// Folders (and loose files) created during a test; removed from the shared real directory after.
const created: string[] = [];

test.afterEach(async ({ sandboxDir }) => {
  for (const entry of created) rmSync(bgPath(sandboxDir, entry), { recursive: true, force: true });
  created.length = 0;
});

async function openPhotos(page: Page): Promise<void> {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(page.getByTestId('photos-tab')).toBeVisible();
  await expect(page.getByTestId('photos-folder-card')).toBeVisible();
}

function chip(page: Page, folder: string) {
  return page.locator(`[data-testid="photos-folder-chip"][data-folder="${folder}"]`);
}

function tiles(page: Page) {
  return page.getByTestId('photo-tile');
}

/** The delete confirm ignores taps in its first moments, so a double tap never confirms. */
async function confirmDelete(page: Page, label: string | RegExp): Promise<void> {
  const sheet = page.getByTestId('confirm-sheet');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(400);
  await sheet.getByRole('button', { name: label }).click();
}

test('the Photos tab explains itself until a photo module exists', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'Screen One', [choreChartModule()])] }));
  await page.goto('/remote');
  // `exact` matters on the tab locators: the Settings sheet (rendered but
  // off-screen) carries "Download config, chores, meals & rewards", which a
  // substring match picks up as a second "Chores" button.
  await expect(page.getByRole('button', { name: 'Chores', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(page.getByText('No photo slideshow yet')).toBeVisible();

  await putConfig(request, photoConfig());
  await page.reload();
  await openPhotos(page);
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  await expect(chip(page, '')).toContainText('Main folder');
  await expect(page.getByTestId('photos-add')).toHaveText('Add photos and videos');
  await expect(page.getByTestId('photos-space')).toContainText('Photos and videos use');
});

test('a windowed photo-slideshow module also surfaces the Photos tab', async ({ page, request }) => {
  const photo = buildModuleInstance('photo-slideshow', { photoSource: { kind: 'library', folder: '' } });
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'Screen One', [photo])] }));
  await openPhotos(page);
  await expect(page.getByText('No photo slideshow yet')).not.toBeVisible();
});

test('the tab opens on the wall\'s folder, says so, and lists it newest first', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  for (const name of ['e2e-first.png', 'e2e-second.png', 'e2e-third.png']) await seedImage(request, folder, name);
  await putConfig(request, photoConfig(folder));
  await openPhotos(page);

  await expect(chip(page, folder)).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, folder)).toHaveAttribute('data-on-wall', 'true');
  const card = page.getByTestId('photos-folder-card');
  await expect(card).toContainText('Showing on Screen One');
  await expect(card).toContainText('3 photos');
  await expect(tiles(page)).toHaveCount(3);
  const order = await tiles(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-path')));
  expect(order).toEqual([`${folder}/e2e-third.png`, `${folder}/e2e-second.png`, `${folder}/e2e-first.png`]);
  // Tiles load the small copy, never the original.
  await expect(tiles(page).first().locator('img')).toHaveAttribute('src', /&w=480&v=\d+$/);
});

test('a download the background rotation owns never shows in Main folder', async ({ page, request, sandboxDir }) => {
  const rotation = `rotation-e2e-${Date.now().toString(36)}.png`;
  writeFileSync(bgPath(sandboxDir, rotation), TINY_PNG_BYTES);
  created.push(rotation);
  await putConfig(request, photoConfig(uniqueFolder()));
  await openPhotos(page);
  await chip(page, '').click();
  await expect(page.getByTestId('photos-folder-card')).toBeVisible();
  await expect(page.locator(`[data-testid="photo-tile"][data-path="${rotation}"]`)).toHaveCount(0);
});

test('adding one photo says where it will show and offers to put it on the wall', async ({ page, request, sandboxDir }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await putConfig(request, photoConfig(folder));
  await page.request.post('/api/backgrounds/directories', { data: { name: folder } });
  await openPhotos(page);
  // A slideshow pointed at an empty folder still counts as on the wall.
  await expect(chip(page, folder)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('photos-folder-card')).toContainText('Showing on Screen One');
  await expect(page.getByTestId('photos-empty')).toContainText(`Nothing in ${folder} yet`);

  await page.getByTestId('photos-file-input').setInputFiles({ name: 'e2e-upload.png', mimeType: 'image/png', buffer: TINY_PNG_BYTES });
  const result = page.getByTestId('photo-upload-result');
  await expect(result).toContainText("1 added. It'll show on Screen One.");
  await expect(tiles(page)).toHaveCount(1);
  await expect.poll(() => existsSync(bgPath(sandboxDir, folder, 'e2e-upload.png'))).toBe(true);

  const show = page.waitForRequest((r) => r.url().endsWith('/api/display/show-photo') && r.method() === 'POST');
  await result.getByTestId('photo-upload-show').click();
  expect((await show).postDataJSON()).toMatchObject({ file: `${folder}/e2e-upload.png`, duration: 60 });
  await expect(page.getByTestId('remote-toast')).toContainText('Showing on the wall for a minute.');
});

test('the card after adding stays with its folder, and a photo gone from the hub says so', async ({ page, request, sandboxDir }) => {
  const folder = uniqueFolder();
  const other = uniqueFolder();
  created.push(folder, other);
  await putConfig(request, photoConfig(folder));
  await page.request.post('/api/backgrounds/directories', { data: { name: folder } });
  await page.request.post('/api/backgrounds/directories', { data: { name: other } });
  await openPhotos(page);

  await page.getByTestId('photos-file-input').setInputFiles({ name: 'e2e-card.png', mimeType: 'image/png', buffer: TINY_PNG_BYTES });
  await expect(page.getByTestId('photo-upload-result')).toContainText("1 added. It'll show on Screen One.");

  // The card speaks for the folder the photo went into: leaving it retires the card.
  await chip(page, other).click();
  await expect(page.getByTestId('photo-upload-result')).toHaveCount(0);
  await chip(page, folder).click();
  await expect(tiles(page)).toHaveCount(1);
  await expect(page.getByTestId('photo-upload-result')).toHaveCount(0);

  // Deleted behind this phone's back: showing it says the photo is gone, not the wall.
  await tiles(page).first().click();
  const viewer = page.getByTestId('photo-viewer');
  await expect(viewer.getByTestId('photo-viewer-count')).toHaveText('1 of 1');
  rmSync(bgPath(sandboxDir, folder, 'e2e-card.png'));
  await viewer.getByTestId('photo-viewer-show').click();
  await expect(page.getByTestId('remote-toast')).toContainText("That photo isn't here anymore.");
  // The re-read drops it, so the viewer closes on its own.
  await expect(viewer).toHaveCount(0);
});

test('Back closes a sheet over the viewer, then the viewer, and stays on the remote', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await seedImage(request, folder, 'e2e-a.png');
  await seedImage(request, folder, 'e2e-b.png');
  await putConfig(request, photoConfig(uniqueFolder()));
  await openPhotos(page);
  await chip(page, folder).click();

  await tiles(page).first().click();
  const viewer = page.getByTestId('photo-viewer');
  await viewer.getByTestId('photo-viewer-delete').click();
  await expect(page.getByTestId('confirm-sheet')).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId('confirm-sheet')).toHaveCount(0);
  await expect(viewer.getByTestId('photo-viewer-count')).toHaveText('1 of 2');

  await page.goBack();
  await expect(viewer).toHaveCount(0);
  await expect(page.getByTestId('photos-tab')).toBeVisible();
  await expect(page).toHaveURL(/\/remote\?/);

  // Closed by its own button, the viewer gives its history step back, so a
  // later Back has no leftover viewer step to land on.
  const ownStep = () => page.evaluate(() => (window.history.state as { hsSheet?: string } | null)?.hsSheet ?? null);
  await tiles(page).first().click();
  await expect.poll(ownStep).not.toBeNull();
  await viewer.getByTestId('photo-viewer-close').click();
  await expect(viewer).toHaveCount(0);
  await expect.poll(ownStep).toBeNull();
});

test('the toast over the viewer sits above its panel, off the buttons', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await seedImage(request, folder, 'e2e-toast.png');
  await putConfig(request, photoConfig(folder));
  await page.route('**/api/display/show-photo', (route) => route.fulfill({ json: { ok: true } }));
  await openPhotos(page);

  await tiles(page).first().click();
  const viewer = page.getByTestId('photo-viewer');
  await viewer.getByTestId('photo-viewer-show').click();
  const toast = page.getByTestId('remote-toast');
  await expect(toast).toContainText('Showing on the wall for a minute.');
  const toastBox = (await toast.boundingBox())!;
  const panelBox = (await viewer.getByTestId('photo-viewer-panel').boundingBox())!;
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(panelBox.y);

  // Back on the grid it returns to its place above the tab bar.
  await viewer.getByTestId('photo-viewer-close').click();
  await expect(viewer).toHaveCount(0);
});

test('the Photos tab comes back to the folder it was left on, after another tab and after a reload', async ({ page, request }) => {
  const wall = uniqueFolder();
  const other = uniqueFolder();
  created.push(wall, other);
  await putConfig(request, photoConfig(wall));
  await page.request.post('/api/backgrounds/directories', { data: { name: wall } });
  await page.request.post('/api/backgrounds/directories', { data: { name: other } });
  await openPhotos(page);
  await expect(chip(page, wall)).toHaveAttribute('aria-pressed', 'true');

  await chip(page, other).click();
  await expect(page).toHaveURL(new RegExp(`folder=${other}`));
  await page.getByRole('button', { name: 'Control', exact: true }).click();
  await page.getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(chip(page, other)).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByTestId('photos-tab')).toBeVisible();
  await expect(chip(page, other)).toHaveAttribute('aria-pressed', 'true');
});

test('deleting a folder inside another goes back to its parent', async ({ page, request }) => {
  const parent = uniqueFolder();
  created.push(parent);
  await putConfig(request, photoConfig(uniqueFolder()));
  await page.request.post('/api/backgrounds/directories', { data: { name: parent } });
  await page.request.post('/api/backgrounds/directories', { data: { name: 'Inner', parent } });
  await openPhotos(page);
  await chip(page, `${parent}/Inner`).click();

  await page.getByTestId('photos-folder-menu').click();
  await page.getByTestId('photo-folder-delete').click();
  await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Delete folder' }).click();
  await expect(page.getByTestId('remote-toast')).toContainText('Folder deleted');
  await expect(chip(page, parent)).toHaveAttribute('aria-pressed', 'true');
});

test('adding several says so once, and every file that could not go is listed with its reason', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await putConfig(request, photoConfig(uniqueFolder()));
  await page.request.post('/api/backgrounds/directories', { data: { name: folder } });
  await openPhotos(page);
  await chip(page, folder).click();

  await page.getByTestId('photos-file-input').setInputFiles([
    { name: 'e2e-a.png', mimeType: 'image/png', buffer: TINY_PNG_BYTES },
    { name: 'e2e-b.png', mimeType: 'image/png', buffer: TINY_PNG_BYTES },
  ]);
  await expect(page.getByTestId('remote-toast')).toContainText("2 added. This folder isn't on the wall yet.");
  await expect(tiles(page)).toHaveCount(2);

  await page.getByTestId('photos-file-input').setInputFiles([
    { name: 'permission-slip.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
    { name: 'IMG_0042.MOV', mimeType: 'video/quicktime', buffer: mp4WithVideo('hvc1') },
    { name: 'e2e-c.png', mimeType: 'image/png', buffer: TINY_PNG_BYTES },
  ]);
  const result = page.getByTestId('photo-upload-result');
  await expect(result).toContainText('1 added.');
  await expect(result).toContainText("2 couldn't be added");
  const failures = result.getByTestId('photo-upload-failures');
  await expect(failures).toContainText("permission-slip.pdf isn't a photo or video the wall can show.");
  // Read from the file itself: an iPhone's default HEVC would play as a black slide.
  await expect(failures).toContainText("IMG_0042.MOV is a kind of video the wall can't play. On an iPhone, choose Most Compatible in Settings > Camera > Formats.");
  await result.getByTestId('photo-upload-close').first().click();
  await expect(result).toHaveCount(0);
});

test('a new folder from the + chip is created and opened', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await putConfig(request, photoConfig(uniqueFolder()));
  await openPhotos(page);

  await page.getByTestId('photos-new-folder').click();
  await page.getByTestId('photo-folder-name').fill(folder);
  await page.getByTestId('photo-folder-name-submit').click();
  await expect(page.getByTestId('remote-toast')).toContainText('Folder created');
  await expect(chip(page, folder)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('photos-folder-card')).toContainText('Not on the wall');
});

test('a photo opens full screen, and deleting it there moves on to the next one', async ({ page, request, sandboxDir }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await seedImage(request, folder, 'e2e-keep.png');
  await seedImage(request, folder, 'e2e-gone.png');
  await putConfig(request, photoConfig(uniqueFolder()));
  await openPhotos(page);
  await chip(page, folder).click();

  await tiles(page).first().click();
  const viewer = page.getByTestId('photo-viewer');
  await expect(viewer.getByTestId('photo-viewer-count')).toHaveText('1 of 2');
  await expect(viewer.getByTestId('photo-viewer-facts')).toContainText('Added');
  await expect(viewer.getByTestId('photo-viewer-showing')).toHaveCount(0);

  await viewer.getByTestId('photo-viewer-delete').click();
  await expect(page.getByTestId('confirm-sheet')).toContainText('It comes out of the photo library for good.');
  await confirmDelete(page, 'Delete');
  await expect(page.getByTestId('remote-toast')).toContainText('Photo deleted');
  await expect(viewer.getByTestId('photo-viewer-count')).toHaveText('1 of 1');
  await expect.poll(() => existsSync(bgPath(sandboxDir, folder, 'e2e-gone.png'))).toBe(false);
  expect(existsSync(bgPath(sandboxDir, folder, 'e2e-keep.png'))).toBe(true);

  await viewer.getByTestId('photo-viewer-close').click();
  await expect(viewer).toHaveCount(0);
});

test('a slideshow keeps its last picture: deleting them all leaves one and says why', async ({ page, request, sandboxDir }) => {
  const folder = uniqueFolder();
  created.push(folder);
  for (const name of ['e2e-1.png', 'e2e-2.png', 'e2e-3.png']) await seedImage(request, folder, name);
  await putConfig(request, photoConfig(folder));
  await openPhotos(page);

  await page.getByTestId('photos-select').click();
  await page.getByTestId('photos-select-all').click();
  await expect(page.getByTestId('photos-selected-count')).toHaveText('3 selected');
  await page.getByTestId('photos-delete').click();
  // Said before deleting, not only after: two go, one stays.
  await expect(page.getByTestId('confirm-sheet')).toContainText(
    "They come off the Screen One slideshow and out of the photo library for good. 1 stays so the Screen One slideshow isn't empty.",
  );
  await confirmDelete(page, 'Delete 2 photos');
  await expect(page.getByTestId('remote-toast')).toContainText("2 deleted. 1 stayed so the Screen One slideshow isn't empty.");
  await expect(tiles(page)).toHaveCount(1);
  // Grid order is newest first, and deleting follows it: the oldest stays.
  expect(existsSync(bgPath(sandboxDir, folder, 'e2e-1.png'))).toBe(true);

  await tiles(page).first().click();
  const viewer = page.getByTestId('photo-viewer');
  await expect(viewer.getByTestId('photo-viewer-showing')).toContainText('Showing on Screen One');
  await expect(viewer.getByTestId('photo-viewer-note')).toContainText('This is the only photo in the Screen One slideshow.');
  await expect(viewer.getByTestId('photo-viewer-delete')).toHaveCount(0);
  await expect(viewer.getByTestId('photo-viewer-move')).toHaveCount(0);

  // Picked alone in select mode, Delete says why instead of asking to delete nothing.
  await viewer.getByTestId('photo-viewer-close').click();
  await page.getByTestId('photos-select').click();
  await tiles(page).first().click();
  await page.getByTestId('photos-delete').click();
  await expect(page.getByTestId('remote-toast')).toContainText("1 stays so the Screen One slideshow isn't empty.");
  await expect(page.getByTestId('confirm-sheet')).toHaveCount(0);
  expect(existsSync(bgPath(sandboxDir, folder, 'e2e-1.png'))).toBe(true);
});

test('a photo a screen uses on its own is locked, but can still be moved', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await seedImage(request, folder, 'e2e-bg.png');
  await putConfig(request, photoConfig(uniqueFolder(), [], { backgroundImage: `${folder}/e2e-bg.png` }));
  await openPhotos(page);
  await chip(page, folder).click();

  await expect(tiles(page).first().locator('[data-used-alone]')).toBeVisible();
  await tiles(page).first().click();
  const viewer = page.getByTestId('photo-viewer');
  await expect(viewer.getByTestId('photo-viewer-used-alone')).toContainText('Background of the Screen One screen');
  await expect(viewer.getByTestId('photo-viewer-note')).toContainText("It can't be deleted while it's a background.");
  await expect(viewer.getByTestId('photo-viewer-delete')).toHaveCount(0);
  await expect(viewer.getByTestId('photo-viewer-move')).toBeVisible();
});

test('moving photos into the wall\'s folder switches there with them first, and the screen follows', async ({ page, request, sandboxDir }) => {
  const from = uniqueFolder();
  const wall = uniqueFolder();
  created.push(from, wall);
  await seedImage(request, wall, 'e2e-old.png');
  await seedImage(request, from, 'e2e-trip-a.png');
  await seedImage(request, from, 'e2e-trip-b.png');
  await putConfig(request, photoConfig(wall));
  await openPhotos(page);
  await chip(page, from).click();

  await page.getByTestId('photos-select').click();
  await page.getByTestId('photos-select-all').click();
  await page.getByTestId('photos-move').click();
  const sheet = page.getByTestId('photo-move-sheet');
  await expect(sheet).toContainText('Move 2 photos to');
  await sheet.getByTestId('photo-move-target').filter({ hasText: wall }).click();

  await expect(page.getByTestId('remote-toast')).toContainText(`2 moved to ${wall}. They'll show on Screen One.`);
  await expect(chip(page, wall)).toHaveAttribute('aria-pressed', 'true');
  await expect(tiles(page)).toHaveCount(3);
  const lead = await tiles(page).evaluateAll((els) => els.slice(0, 2).map((el) => el.getAttribute('data-path')).sort());
  expect(lead).toEqual([`${wall}/e2e-trip-a.png`, `${wall}/e2e-trip-b.png`]);
  await expect.poll(() => existsSync(bgPath(sandboxDir, wall, 'e2e-trip-a.png'))).toBe(true);
});

test('renaming the wall\'s folder keeps the slideshow on it', async ({ page, request }) => {
  const folder = uniqueFolder();
  const renamed = `${folder}-renamed`;
  created.push(folder, renamed);
  await seedImage(request, folder, 'e2e-a.png');
  await putConfig(request, photoConfig(folder));
  await openPhotos(page);

  await page.getByTestId('photos-folder-menu').click();
  const menu = page.getByTestId('photo-folder-menu');
  await expect(menu).toContainText('Showing on Screen One');
  // Not empty yet, so delete is offered with the reason it cannot work.
  await expect(menu.getByTestId('photo-folder-delete')).toBeDisabled();
  await expect(menu.getByTestId('photo-folder-delete')).toContainText('Move or delete its 1 photo first.');
  await menu.getByTestId('photo-folder-rename').click();
  await expect(page.getByTestId('photo-folder-name-sheet')).toContainText('It keeps showing on Screen One under its new name.');
  await page.getByTestId('photo-folder-name').fill(renamed);
  await page.getByTestId('photo-folder-name-submit').click();

  await expect(page.getByTestId('remote-toast')).toContainText(`Renamed to ${renamed}`);
  await expect(chip(page, renamed)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('photos-folder-card')).toContainText('Showing on Screen One');
  const config = await getConfig(request);
  expect((config.screens[0].modules[0].config as { photoSource: { folder: string } }).photoSource.folder).toBe(renamed);
});

test('an empty folder can be deleted from its menu', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await putConfig(request, photoConfig(uniqueFolder()));
  await page.request.post('/api/backgrounds/directories', { data: { name: folder } });
  await openPhotos(page);
  await chip(page, folder).click();

  await page.getByTestId('photos-folder-menu').click();
  await page.getByTestId('photo-folder-delete').click();
  const sheet = page.getByTestId('confirm-sheet');
  await expect(sheet).toContainText(`Delete the folder ${folder}?`);
  await expect(sheet).toContainText("It's empty, so nothing on the wall changes.");
  await sheet.getByRole('button', { name: 'Delete folder' }).click();
  await expect(page.getByTestId('remote-toast')).toContainText('Folder deleted');
  await expect(chip(page, folder)).toHaveCount(0);
});

test('Google Photos is offered once the hub is signed in, and adds the picks to the folder being viewed', async ({ page, request }) => {
  const folder = uniqueFolder();
  await putConfig(request, photoConfig(folder));
  await page.request.post('/api/backgrounds/directories', { data: { name: folder } });
  created.push(folder);

  await openPhotos(page);
  await expect(page.getByTestId('photos-add-google')).toHaveCount(0);

  // Google itself is never reached: the hub's picker routes are stubbed.
  await page.route('**/api/google-picker/status', (route) => route.fulfill({ json: { connected: true, credentialsConfigured: true } }));
  await page.route('**/api/google-picker/session**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { id: 'sess-1', pickerUri: 'https://photos.google.com/picker/sess-1', pollIntervalMs: 1000 } });
    }
    return route.fulfill({ json: { mediaItemsSet: true } });
  });
  let importBody: unknown = null;
  await page.route('**/api/google-picker/import**', (route) => {
    if (route.request().method() === 'POST') {
      importBody = route.request().postDataJSON();
      return route.fulfill({ status: 202, json: { jobId: 'job-1', total: 2 } });
    }
    return route.fulfill({ json: { state: 'done', total: 2, done: 2, skipped: 0, failed: 0, videoFiles: [] } });
  });
  await openPhotos(page);
  await page.getByTestId('photos-add-google').click();
  const sheet = page.getByTestId('photo-google-sheet');
  await expect(sheet.getByTestId('photo-google-open')).toHaveAttribute('href', 'https://photos.google.com/picker/sess-1');
  await expect(sheet.getByTestId('photo-import-result')).toContainText("2 added. They'll show on Screen One.");
  expect(importBody).toEqual({ sessionId: 'sess-1', folder });
});

test('after picks that could not be added, Try again brings the Google Photos link back', async ({ page, request }) => {
  const folder = uniqueFolder();
  await putConfig(request, photoConfig(folder));
  await page.request.post('/api/backgrounds/directories', { data: { name: folder } });
  created.push(folder);

  await page.route('**/api/google-picker/status', (route) => route.fulfill({ json: { connected: true, credentialsConfigured: true } }));
  let sessions = 0;
  let picked = false;
  await page.route('**/api/google-picker/session**', (route) => {
    if (route.request().method() === 'POST') {
      sessions += 1;
      return route.fulfill({ json: { id: `sess-${sessions}`, pickerUri: `https://photos.google.com/picker/sess-${sessions}`, pollIntervalMs: 1000 } });
    }
    if (route.request().method() === 'DELETE') return route.fulfill({ json: {} });
    return route.fulfill({ json: { mediaItemsSet: picked } });
  });
  let starts = 0;
  await page.route('**/api/google-picker/import**', (route) => {
    if (route.request().method() === 'POST') {
      starts += 1;
      // The first picks land while another import is still running.
      return starts === 1
        ? route.fulfill({ status: 409, json: { error: 'busy' } })
        : route.fulfill({ status: 202, json: { jobId: 'job-2', total: 1 } });
    }
    return route.fulfill({ json: { state: 'done', total: 1, done: 1, skipped: 0, failed: 0, videoFiles: [] } });
  });
  await openPhotos(page);
  await page.getByTestId('photos-add-google').click();
  const sheet = page.getByTestId('photo-google-sheet');
  await expect(sheet.getByTestId('photo-google-open')).toHaveAttribute('href', 'https://photos.google.com/picker/sess-1');
  picked = true;
  await expect(sheet.getByTestId('photo-import-error')).toHaveText('Photos are still being added. Try again in a minute.');

  // A new picking session, and its link shows instead of the old message.
  picked = false;
  await sheet.getByRole('button', { name: 'Try again' }).click();
  await expect(sheet.getByTestId('photo-google-open')).toHaveAttribute('href', 'https://photos.google.com/picker/sess-2');
  await expect(sheet.getByTestId('photo-import-error')).toHaveCount(0);
  picked = true;
  await expect(sheet.getByTestId('photo-import-result')).toContainText("1 added. It'll show on Screen One.");
});

test('an iCloud link is added to the folder being viewed, and a bad link says so', async ({ page, request }) => {
  const folder = uniqueFolder();
  await putConfig(request, photoConfig(folder));
  await page.request.post('/api/backgrounds/directories', { data: { name: folder } });
  created.push(folder);

  let started: unknown = null;
  await page.route('**/api/icloud/import**', (route) => {
    if (route.request().method() === 'POST') {
      started = route.request().postDataJSON();
      const { url } = started as { url: string };
      return url.includes('icloud.com')
        ? route.fulfill({ status: 202, json: { jobId: 'job-2', total: 1 } })
        : route.fulfill({ status: 400, json: { error: 'invalid-link' } });
    }
    return route.fulfill({ json: { state: 'done', total: 1, done: 1, skipped: 0, failed: 0, videoFiles: [] } });
  });
  await openPhotos(page);
  await page.getByTestId('photos-add-icloud').click();
  const sheet = page.getByTestId('photo-icloud-sheet');
  await sheet.getByTestId('photo-icloud-url').fill('https://example.com/not-apple');
  await sheet.getByTestId('photo-icloud-start').click();
  await expect(sheet.getByTestId('photo-import-error')).toContainText("That doesn't look like an iCloud photo link.");

  await sheet.getByTestId('photo-icloud-url').fill('https://www.icloud.com/sharedalbum/#B0aGWZuqDGSZqa');
  await sheet.getByTestId('photo-icloud-start').click();
  await expect(sheet.getByTestId('photo-import-result')).toContainText("1 added. It'll show on Screen One.");
  expect(started).toEqual({ url: 'https://www.icloud.com/sharedalbum/#B0aGWZuqDGSZqa', folder });
});

test('an iCloud album with nothing in it says so, and one that is gone says that instead', async ({ page, request }) => {
  const folder = uniqueFolder();
  await putConfig(request, photoConfig(folder));
  await page.request.post('/api/backgrounds/directories', { data: { name: folder } });
  created.push(folder);

  let gone = false;
  await page.route('**/api/icloud/import**', (route) => {
    if (route.request().method() !== 'POST') {
      return route.fulfill({ json: { state: 'done', total: 0, done: 0, skipped: 0, failed: 0, videoFiles: [] } });
    }
    return gone
      ? route.fulfill({ status: 400, json: { error: 'album-gone' } })
      : route.fulfill({ status: 202, json: { jobId: 'job-empty', total: 0 } });
  });
  await openPhotos(page);
  await page.getByTestId('photos-add-icloud').click();
  const sheet = page.getByTestId('photo-icloud-sheet');
  await sheet.getByTestId('photo-icloud-url').fill('https://www.icloud.com/sharedalbum/#B0aGWZuqDGx0J3Vq');
  await sheet.getByTestId('photo-icloud-start').click();
  await expect(sheet.getByTestId('photo-import-result')).toHaveText("There's nothing in that album to add.");

  gone = true;
  await sheet.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('photos-add-icloud').click();
  await sheet.getByTestId('photo-icloud-url').fill('https://www.icloud.com/sharedalbum/#B0aGWZuqDGx0J3Vq');
  await sheet.getByTestId('photo-icloud-start').click();
  await expect(sheet.getByTestId('photo-import-error')).toHaveText(
    "That album isn't shared anymore. Share it again in the Photos app and paste the new link.",
  );
});

test('the Control tab steps the slideshow on the screen showing now', async ({ page, request }) => {
  const slideshow = buildModuleInstance('photo-slideshow', { photoSource: { kind: 'library', folder: uniqueFolder() } });
  await putConfig(request, baseConfig({ screens: [makeScreen('screen-0', 'Screen One', [slideshow])] }));
  await postHeartbeat(request, { screenCount: 1, currentIndex: 0 });
  await page.goto('/remote');

  const card = page.getByTestId('slideshow-controls');
  await expect(card).toBeVisible();
  const sent: unknown[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/display/module-command') && r.method() === 'POST') sent.push(r.postDataJSON());
  });
  await card.getByTestId('slideshow-next').click();
  await card.getByTestId('slideshow-pause').click();
  await expect(card.getByTestId('slideshow-pause')).toHaveAttribute('aria-pressed', 'true');
  await card.getByTestId('slideshow-back').click();
  await expect.poll(() => sent).toEqual([
    { module: 'photo-slideshow', action: 'next' },
    { module: 'photo-slideshow', action: 'pause' },
    { module: 'photo-slideshow', action: 'prev' },
  ]);
});
