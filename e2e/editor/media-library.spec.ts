import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { mp4WithVideo } from '../helpers/video-samples';

/**
 * The Pictures & videos settings page (the library's new home) and the
 * background picker it replaced: uploading through the real page, the in-use
 * lock that spares files a screen still shows, the viewer a tile opens,
 * deletion of the free ones (batch and per tile), and the picker keeping
 * upload but no longer offering per-file delete.
 *
 * `public/backgrounds` is shared by every worker (see photos.spec.ts), so
 * each test works inside its own uniquely named folder.
 */

/** 1×1 transparent PNG, the same bytes the radar tile stubs use. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function uniqueFolder(): string {
  return `e2e-media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Seed one image into a folder the way the page would, via the real upload API. */
async function seedImage(request: APIRequestContext, directory: string, name: string): Promise<void> {
  const res = await request.post('/api/backgrounds', {
    multipart: {
      directory,
      file: { name, mimeType: 'image/png', buffer: PNG_1X1 },
    },
  });
  expect(res.ok()).toBe(true);
}

async function removeFolder(request: APIRequestContext, folder: string): Promise<void> {
  await request.delete('/api/backgrounds/directories', { data: { path: folder } }).catch(() => {});
}

test.describe('Defaults › Pictures & videos', () => {
  test('the media page shows the library, locks used files, opens a viewer, and deletes unused ones', async ({ page, request }) => {
    const folder = uniqueFolder();
    await seedImage(request, folder, 'e2e-a.png');
    await putConfig(request, baseConfig());
    await page.goto('/editor/settings?section=defaults&page=media');
    await expect(page.getByTestId('media-upload-button')).toBeVisible();

    // Upload a batch through the page's own picker into the test folder:
    // both files must land as tiles carrying their filenames, and the panel
    // closes behind the batch.
    await page.getByTestId('media-upload-button').click();
    const panel = page.getByTestId('media-upload-panel');
    await expect(panel).toBeVisible();
    await panel.locator('[data-upload-directory]').selectOption(folder);
    await panel.locator('[data-file-input]').setInputFiles([
      { name: 'e2e-b.png', mimeType: 'image/png', buffer: PNG_1X1 },
      { name: 'e2e-c.png', mimeType: 'image/png', buffer: PNG_1X1 },
    ]);

    const usedTile = page.getByTestId(`media-tile-${folder}/e2e-a.png`);
    const freeTile = page.getByTestId(`media-tile-${folder}/e2e-b.png`);
    const otherTile = page.getByTestId(`media-tile-${folder}/e2e-c.png`);
    await expect(freeTile).toContainText('e2e-b.png');
    await expect(otherTile).toContainText('e2e-c.png');
    await expect(panel).toHaveCount(0);
    // Tiles carry a real lazy image (the small WebP copy) and a type tag.
    await expect(freeTile.locator('img[loading="lazy"]')).toHaveAttribute('src', /e2e-b\.png&w=480&v=\d+$/);
    const thumb = await request.get(`/api/backgrounds/serve?file=${encodeURIComponent(`${folder}/e2e-b.png`)}&w=480`);
    expect(thumb.headers()['content-type']).toBe('image/webp');
    await expect(freeTile.locator('[data-type-tag]')).toHaveText('PNG');

    // Reference one file from the screen (bare path form, the shape the
    // editor saves), then reload: the inventory's usage scan must see it and
    // lock that tile behind the in-use badge and a disabled checkbox.
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [textModule('E2E HOME SCREEN')], { backgroundImage: `${folder}/e2e-a.png` })],
    }));
    const inventoryLoaded = page.waitForResponse(
      (r) => r.url().includes('/api/backgrounds/inventory') && r.ok(),
    );
    await page.reload();
    const inventory = (await (await inventoryLoaded).json()) as {
      items: { path: string }[];
      usage: Record<string, unknown[]>;
    };
    expect(inventory.items.map((item) => item.path)).toContain(`${folder}/e2e-a.png`);
    expect(inventory.usage[`${folder}/e2e-a.png`].length).toBeGreaterThan(0);
    await page.getByTestId(`media-chip-${folder}`).click();
    await expect(usedTile.locator('[data-in-use]')).toContainText('In use');
    await expect(usedTile.getByTestId('media-tile-delete')).toHaveCount(0);
    await expect(freeTile.locator('input[type="checkbox"]')).toBeEnabled();
    await expect(freeTile.locator('[data-in-use]')).toHaveCount(0);

    // Clicking a tile opens the viewer, and does not select the file. A used
    // file opens too, with its where-used list and no delete.
    await usedTile.getByTestId('media-tile-open').click();
    const viewer = page.getByTestId('media-viewer');
    await expect(viewer.getByTestId('media-viewer-name')).toHaveText('e2e-a.png');
    await expect(viewer.getByTestId('media-viewer-image')).toHaveAttribute('src', /e2e-a\.png/);
    await expect(viewer.getByTestId('media-viewer-used-by')).toContainText("Screen 'Screen 1'");
    await expect(viewer.getByTestId('media-viewer-delete')).toHaveCount(0);
    await expect(usedTile).not.toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByTestId('media-viewer-name')).toHaveText('e2e-b.png');
    await expect(viewer.getByTestId('media-viewer-delete')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(freeTile).not.toHaveAttribute('data-selected', 'true');

    // Batch delete is possible for a free file and spares the used one.
    await freeTile.locator('input[type="checkbox"]').click();
    await expect(freeTile).toHaveAttribute('data-selected', 'true');
    await page.getByTestId('media-delete-button').click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Delete 1 file?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(freeTile).toHaveCount(0);
    await expect(usedTile).toBeVisible();

    // The per-tile button deletes just that one file after the same confirm.
    await otherTile.hover();
    await otherTile.getByTestId('media-tile-delete').click();
    const dialog2 = page.getByRole('dialog').filter({ hasText: 'Delete 1 file?' });
    await expect(dialog2).toBeVisible();
    await dialog2.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(otherTile).toHaveCount(0);
    await expect(usedTile).toBeVisible();

    // All three facts survive a reload: the free files are gone from the
    // library, the used one is still there.
    await page.reload();
    await page.getByTestId(`media-chip-${folder}`).click();
    await expect(usedTile).toContainText('e2e-a.png');
    await expect(freeTile).toHaveCount(0);
    await expect(otherTile).toHaveCount(0);

    await putConfig(request, baseConfig());
    await request.delete('/api/backgrounds', { data: { file: 'e2e-a.png', directory: folder } });
    await removeFolder(request, folder);
  });

  test('an upload holds back a video the wall cannot play, says why, and sends the rest', async ({ page, request }) => {
    const folder = uniqueFolder();
    await seedImage(request, folder, 'e2e-seed.png');
    await putConfig(request, baseConfig());
    await page.goto('/editor/settings?section=defaults&page=media');
    await page.getByTestId('media-upload-button').click();
    const panel = page.getByTestId('media-upload-panel');
    await panel.locator('[data-upload-directory]').selectOption(folder);
    await panel.locator('[data-file-input]').setInputFiles([
      { name: 'IMG_0042.MOV', mimeType: 'video/quicktime', buffer: mp4WithVideo('hvc1') },
      { name: 'e2e-ok.png', mimeType: 'image/png', buffer: PNG_1X1 },
    ]);

    await expect(page.getByTestId(`media-tile-${folder}/e2e-ok.png`)).toBeVisible();
    // The panel stays open while it says why the video stayed behind.
    await expect(panel.getByTestId('media-upload-wont-play')).toHaveText(
      "IMG_0042.MOV is a kind of video the wall can't play. On an iPhone, choose Most Compatible in Settings > Camera > Formats.",
    );
    await expect(page.getByTestId(`media-tile-${folder}/IMG_0042.MOV`)).toHaveCount(0);
    await removeFolder(request, folder);
  });

  test('the Unused chip, the missing-file report, replace in place and the jump into the editor', async ({ page, request }) => {
    const folder = uniqueFolder();
    await seedImage(request, folder, 'e2e-used.png');
    await seedImage(request, folder, 'e2e-free.png');
    await putConfig(request, baseConfig({
      screens: [
        makeScreen('screen-1', 'Hall', [textModule('E2E HOME SCREEN')], { backgroundImage: `${folder}/e2e-used.png` }),
        makeScreen('screen-2', 'Porch', [textModule('PORCH')], { backgroundImage: `${folder}/e2e-gone.png` }),
      ],
    }));

    await page.goto('/editor/settings?section=defaults&page=media');
    await page.getByTestId(`media-chip-${folder}`).click();
    const usedTile = page.getByTestId(`media-tile-${folder}/e2e-used.png`);
    const freeTile = page.getByTestId(`media-tile-${folder}/e2e-free.png`);
    await expect(usedTile).toBeVisible();
    await expect(freeTile).toBeVisible();

    // The storage line and the folder chip's size tooltip come from the inventory.
    await expect(page.getByTestId('media-storage')).toContainText('Library uses');
    await expect(page.getByTestId(`media-chip-${folder}`)).toHaveAttribute('title', /B$/);

    // Unused only hides the file the Hall screen shows.
    await page.getByTestId('media-unused-only').click();
    await expect(usedTile).toHaveCount(0);
    await expect(freeTile).toBeVisible();
    await page.getByTestId('media-unused-only').click();

    // The Porch screen points at a file that was never uploaded.
    const missing = page.getByTestId('media-missing');
    await expect(missing).toContainText(`Screen 'Porch' points at ${folder}/e2e-gone.png, which is missing`);

    // Replace keeps the name: the tile's picture changes, the reference does not.
    const before = await request.get(`/api/backgrounds/serve?file=${encodeURIComponent(`${folder}/e2e-used.png`)}`);
    const etagBefore = before.headers()['etag'];
    const srcBefore = await usedTile.locator('img').getAttribute('src');
    await usedTile.hover();
    await usedTile.getByTestId('media-tile-replace').click();
    await page.getByTestId('media-replace-input').setInputFiles({
      name: 'new-picture.png',
      mimeType: 'image/png',
      buffer: Buffer.concat([PNG_1X1, Buffer.from([0])]),
    });
    await expect(page.getByTestId('media-outcome')).toHaveAttribute('data-ok', 'true');
    const after = await request.get(`/api/backgrounds/serve?file=${encodeURIComponent(`${folder}/e2e-used.png`)}`);
    expect(after.headers()['etag']).not.toBe(etagBefore);
    // The tile's URL carries the new modified time, so the browser fetches the
    // new picture. The old URL ends in a modified time too, so wait for it to
    // go rather than reading the attribute once: the list reloads a beat after
    // the upload is reported done.
    await expect(usedTile.locator('img')).not.toHaveAttribute('src', srcBefore!);
    await expect(usedTile.locator('img')).toHaveAttribute('src', /&v=\d+$/);
    await expect(usedTile.locator('[data-in-use]')).toContainText('In use');

    // A where-used line opens the editor on that screen.
    await usedTile.hover();
    await usedTile.locator('[data-used-by]').getByTestId('media-used-by-link').click();
    await expect(page).toHaveURL(/\/editor\?screen=screen-1/);
    await expect(page.getByTestId('editor-canvas')).toBeVisible();

    await putConfig(request, baseConfig());
    for (const name of ['e2e-used.png', 'e2e-free.png']) {
      await request.delete('/api/backgrounds', { data: { file: name, directory: folder } });
    }
    await removeFolder(request, folder);
  });

  test('folders can be created, renamed and deleted, and files moved, with references following', async ({ page, request }) => {
    const folder = uniqueFolder();
    const renamed = `${folder}-renamed`;
    await seedImage(request, folder, 'e2e-move.png');
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Hall', [textModule('E2E HOME SCREEN')], { backgroundImage: `${folder}/e2e-move.png` })],
    }));

    await page.goto('/editor/settings?section=defaults&page=media');
    await page.getByTestId(`media-chip-${folder}`).click();

    // Rename the folder: the chip follows and the screen's reference is rewritten.
    await page.getByTestId('media-folder-rename').click();
    await page.getByTestId('media-folder-name').fill(renamed);
    await page.getByTestId('media-folder-submit').click();
    await expect(page.getByTestId('media-outcome')).toHaveAttribute('data-ok', 'true');
    await expect(page.getByTestId(`media-chip-${renamed}`)).toHaveAttribute('aria-pressed', 'true');
    const afterRename = await (await request.get('/api/config')).json() as { screens: { backgroundImage: string }[] };
    expect(afterRename.screens[0].backgroundImage).toBe(`${renamed}/e2e-move.png`);

    // Create a sibling folder at the top level, then move the file into it.
    const target = `${folder}-target`;
    await page.getByTestId('media-chip-all').click();
    await page.getByTestId('media-folder-create').click();
    await page.getByTestId('media-folder-name').fill(target);
    await page.getByTestId('media-folder-submit').click();
    await expect(page.getByTestId(`media-chip-${target}`)).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId(`media-chip-${renamed}`).click();
    const tile = page.getByTestId(`media-tile-${renamed}/e2e-move.png`);
    await tile.locator('input[type="checkbox"]').click();
    await page.getByTestId('media-move-select').selectOption(target);
    const dialog = page.getByRole('dialog').filter({ hasText: 'Move 1 file?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.getByTestId('media-outcome')).toContainText('1 file moved');
    await expect(page.getByTestId('media-outcome')).toContainText('1 place that used them was updated');
    const afterMove = await (await request.get('/api/config')).json() as { screens: { backgroundImage: string }[] };
    expect(afterMove.screens[0].backgroundImage).toBe(`${target}/e2e-move.png`);
    // The grid still shows the folder it was on; the file now lives in the target.
    await expect(page.getByTestId(`media-tile-${renamed}/e2e-move.png`)).toHaveCount(0);
    await page.getByTestId(`media-chip-${target}`).click();
    await expect(page.getByTestId(`media-tile-${target}/e2e-move.png`)).toBeVisible();

    // The emptied folder can be deleted; the full one is refused with a plain reason.
    await page.getByTestId(`media-chip-${target}`).click();
    await page.getByTestId('media-folder-delete').click();
    const refuse = page.getByRole('dialog').filter({ hasText: `Delete the folder ${target}?` });
    await refuse.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('media-outcome')).toContainText('still has files in it');

    await page.getByTestId(`media-chip-${renamed}`).click();
    await page.getByTestId('media-folder-delete').click();
    const confirm = page.getByRole('dialog').filter({ hasText: `Delete the folder ${renamed}?` });
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('media-outcome')).toContainText(`Folder ${renamed} deleted`);
    await expect(page.getByTestId(`media-chip-${renamed}`)).toHaveCount(0);

    // Search and sort are plain view controls.
    await page.getByTestId('media-chip-all').click();
    await page.getByTestId('media-search').fill('e2e-move');
    await expect(page.locator('[data-media-path]')).toHaveCount(1);
    await page.getByTestId('media-sort').selectOption('largest');
    await expect(page.locator('[data-media-path]')).toHaveCount(1);

    await putConfig(request, baseConfig());
    await request.delete('/api/backgrounds', { data: { file: 'e2e-move.png', directory: target } });
    await removeFolder(request, target);
  });

  test("a slideshow's pictures can go, except its last one", async ({ page, request }) => {
    const folder = uniqueFolder();
    await seedImage(request, folder, 'e2e-slide-a.png');
    await seedImage(request, folder, 'e2e-slide-b.png');
    const slideshow = buildModuleInstance('photo-slideshow', { source: 'local', directory: folder });
    await putConfig(request, baseConfig({ screens: [makeScreen('screen-1', 'Hall', [slideshow])] }));

    await page.goto('/editor/settings?section=defaults&page=media');
    await page.getByTestId(`media-chip-${folder}`).click();
    const first = page.getByTestId(`media-tile-${folder}/e2e-slide-a.png`);
    const second = page.getByTestId(`media-tile-${folder}/e2e-slide-b.png`);
    // Both play in the slideshow and either could go: a green badge, not a lock.
    await expect(first.locator('[data-slideshow]')).toContainText('Slideshow');
    await expect(first.locator('[data-slideshow]')).toHaveAttribute('title', "Slideshow on 'Hall'");
    await expect(first.locator('[data-in-use]')).toHaveCount(0);

    await first.hover();
    await first.getByTestId('media-tile-delete').click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Delete 1 file?' });
    await expect(dialog).toContainText("It'll be gone from this hub for good. A slideshow that shows it moves on to its other pictures");
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(first).toHaveCount(0);

    // Now the last picture it has: locked, with the reason in the viewer.
    await expect(second.locator('[data-in-use]')).toContainText('In use');
    await expect(second.locator('[data-in-use]')).toHaveAttribute('title', "Slideshow on 'Hall' (its last picture)");
    await expect(second.getByTestId('media-tile-delete')).toHaveCount(0);
    await second.getByTestId('media-tile-open').click();
    const viewer = page.getByTestId('media-viewer');
    await expect(viewer.getByTestId('media-viewer-lock-hint')).toContainText(`Add another one to ${folder} first.`);
    await expect(viewer.getByTestId('media-viewer-delete')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // The server refuses too, whatever page sent the request.
    const res = await request.delete('/api/backgrounds', { data: { file: 'e2e-slide-b.png', directory: folder } });
    expect(res.status()).toBe(409);

    await putConfig(request, baseConfig());
    await request.delete('/api/backgrounds', { data: { file: 'e2e-slide-b.png', directory: folder } });
    await removeFolder(request, folder);
  });

  test('deleting a whole slideshow folder keeps its last picture and says so', async ({ page, request }) => {
    const folder = uniqueFolder();
    for (const name of ['e2e-x.png', 'e2e-y.png', 'e2e-z.png']) await seedImage(request, folder, name);
    const slideshow = buildModuleInstance('photo-slideshow', { source: 'local', directory: folder });
    await putConfig(request, baseConfig({ screens: [makeScreen('screen-1', 'Hall', [slideshow])] }));

    await page.goto('/editor/settings?section=defaults&page=media');
    await page.getByTestId(`media-chip-${folder}`).click();
    await expect(page.locator(`[data-media-path^="${folder}/"]`)).toHaveCount(3);
    await page.getByTestId('media-select-all').click();
    await page.getByTestId('media-delete-button').click();
    await page.getByRole('dialog').filter({ hasText: 'Delete 3 files?' }).getByRole('button', { name: 'Delete', exact: true }).click();

    // Deleting goes in grid order (by name), so the last name stays.
    await expect(page.getByTestId('media-refused')).toContainText("e2e-z.png was kept: it's the last picture in the slideshow on 'Hall'.");
    await expect(page.locator(`[data-media-path^="${folder}/"]`)).toHaveCount(1);

    await putConfig(request, baseConfig());
    await request.delete('/api/backgrounds', { data: { file: 'e2e-z.png', directory: folder } });
    await removeFolder(request, folder);
  });
});

test.describe('background controls', () => {
  test('the editor has only Shade and Sources; uploads remain in the media library', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor');
    await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('heading', { name: 'Shade' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(page.getByTestId('background-tab-local')).toHaveCount(0);
    await expect(page.getByText('Your own pictures')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Upload Background' })).toHaveCount(0);
    await page.goto('/editor/settings?section=defaults&page=media');
    await expect(page.getByTestId('media-upload-button')).toBeVisible();
  });
});
