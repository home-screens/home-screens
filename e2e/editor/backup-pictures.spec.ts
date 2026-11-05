import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { promises as fs } from 'fs';
import yauzl from 'yauzl';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * Pictures in a backup: the Pictures choice under Save a copy, the zip the
 * hub streams for "only the ones your screens use" and for the whole
 * library, and a zip restore that puts the files back (adding missing ones,
 * replacing a same-named file of a different size, never deleting).
 *
 * The library is shared by every worker (see media-library.spec.ts), so each
 * test keeps to its own uniquely named folder.
 */

/** 1x1 transparent PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
/** The same picture with a trailing comment chunk, so it differs in size. */
const PNG_BIGGER = Buffer.concat([PNG, Buffer.from('padding-that-changes-the-size')]);

function uniqueFolder(): string {
  return `e2e-bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seedImage(request: APIRequestContext, directory: string, name: string, bytes: Buffer = PNG): Promise<void> {
  const res = await request.post('/api/backgrounds', {
    multipart: { directory, file: { name, mimeType: 'image/png', buffer: bytes } },
  });
  expect(res.ok()).toBe(true);
}

async function removeFolder(request: APIRequestContext, folder: string): Promise<void> {
  await request.delete('/api/backgrounds/directories', { data: { path: folder } }).catch(() => {});
}

/** Entry names of a zip on disk, in order. */
function zipEntries(file: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      const names: string[] = [];
      zipfile.on('entry', (entry) => { names.push(entry.fileName); zipfile.readEntry(); });
      zipfile.on('end', () => resolve(names));
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  });
}

/** A config whose screen background is `bg` and whose slideshow plays `folder`. */
function configUsing(folder: string, bg: string) {
  const slideshow = buildModuleInstance('photo-slideshow');
  slideshow.config = { ...slideshow.config, photoSource: { kind: 'library', folder: `${folder}/slides` }, mediaTypes: 'photos' };
  return baseConfig({
    screens: [makeScreen('s1', 'Kitchen', [textModule('hello'), slideshow], {
      backgroundImage: `/api/backgrounds/serve?file=${encodeURIComponent(`${folder}/${bg}`)}`,
    })],
  });
}

async function libraryHas(request: APIRequestContext, libraryPath: string): Promise<boolean> {
  const res = await request.get(`/api/backgrounds/serve?file=${encodeURIComponent(libraryPath)}`);
  return res.ok();
}

test.describe('Defaults › Backups & data › Pictures', () => {
  test('the choice lists sizes, "used" zips only what the screens use, "all" zips the whole folder', async ({ page, request }) => {
    const folder = uniqueFolder();
    try {
      await seedImage(request, folder, 'bg.png');
      await seedImage(request, `${folder}/slides`, 'one.png');
      await seedImage(request, `${folder}/slides`, 'two.png');
      await seedImage(request, folder, 'unused.png');
      await putConfig(request, configUsing(folder, 'bg.png'));
      // The labels come from the summary route.
      const summary = page.waitForResponse((r) => r.url().includes('/api/backup/pictures?summary=1') && r.ok());
      await page.goto('/editor/settings?section=defaults&page=data');
      expect((await (await summary).json()).used.count).toBeGreaterThanOrEqual(3);

      const group = page.locator('[data-field-id="data.fullBackupPictures"]');
      await expect(group).toBeVisible();
      // Counts come from the summary route; other workers' folders may add
      // to "all", so only the relation is fixed.
      await expect(group.getByText(/Only the ones your screens use \(\d+ files, /)).toBeVisible();
      await expect(group.getByText(/Everything in your picture library \(\d+ files, /)).toBeVisible();
      // The default is remembered per browser and starts at "used".
      await expect(group.getByRole('radio', { name: /Only the ones your screens use/ })).toBeChecked();

      let download = page.waitForEvent('download');
      const archived = page.waitForResponse((r) => r.url().endsWith('/api/backup/archive'));
      await page.getByRole('button', { name: 'Save a backup' }).click();
      expect((await archived).headers()['content-type']).toBe('application/zip');
      let file = await download;
      expect(file.suggestedFilename()).toMatch(/^home-screens-backup-\d{4}-\d{2}-\d{2}\.zip$/);
      let entries = await zipEntries(await file.path());
      expect(entries[0]).toBe('backup.json');
      const mine = entries.filter((e) => e.includes(folder));
      expect(mine.sort()).toEqual([
        `pictures/${folder}/bg.png`, `pictures/${folder}/slides/one.png`, `pictures/${folder}/slides/two.png`,
      ]);
      await expect(page.getByText(/Saved home-screens-backup-.*\.zip to your downloads\./)).toBeVisible();

      await group.getByRole('radio', { name: /Everything in your picture library/ }).check();
      download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Save a backup' }).click();
      file = await download;
      entries = await zipEntries(await file.path());
      expect(entries).toContain(`pictures/${folder}/unused.png`);
      expect(await page.evaluate(() => localStorage.getItem('hs-backup-pictures'))).toBe('all');

      // Leaving them out is the JSON file it always was.
      await group.getByRole('radio', { name: 'Leave them out' }).check();
      download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Save a backup' }).click();
      file = await download;
      expect(file.suggestedFilename()).toMatch(/\.json$/);
    } finally {
      await removeFolder(request, folder);
    }
  });

  test('restoring a zip puts the pictures back, replacing a changed file and keeping the rest', async ({ page, request }) => {
    const folder = uniqueFolder();
    try {
      await seedImage(request, folder, 'bg.png');
      await seedImage(request, `${folder}/slides`, 'one.png');
      await seedImage(request, folder, 'keep-me.png');
      await putConfig(request, configUsing(folder, 'bg.png'));
      await page.goto('/editor/settings?section=defaults&page=data');
      await page.locator('[data-field-id="data.fullBackupPictures"]').getByRole('radio', { name: /Only the ones your screens use/ }).check();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Save a backup' }).click();
      const zipPath = await (await download).path();
      const zip = await fs.readFile(zipPath);

      // The hub loses the slideshow picture, and the background is replaced
      // by a different-sized file under the same name. `keep-me.png` is not
      // in the backup and must survive the restore.
      await putConfig(request, baseConfig());
      await request.delete('/api/backgrounds', { data: { file: 'one.png', directory: `${folder}/slides` } });
      const replaced = await request.post('/api/backgrounds', {
        multipart: { replace: `${folder}/bg.png`, file: { name: 'bg.png', mimeType: 'image/png', buffer: PNG_BIGGER } },
      });
      expect(replaced.ok()).toBe(true);
      expect(await libraryHas(request, `${folder}/slides/one.png`)).toBe(false);

      await page.reload();
      await page.getByRole('button', { name: 'Restore from a file' }).click();
      await page.getByRole('button', { name: 'Choose a file…' }).click();
      const staged = page.waitForResponse((r) => r.url().endsWith('/api/backup/upload'));
      await page.getByTestId('backup-restore-input').setInputFiles({ name: 'home-screens-backup.zip', mimeType: 'application/zip', buffer: zip });
      expect((await (await staged).json()).pictures.count).toBe(2);
      // The hub says what the zip holds before anything is replaced.
      await expect(page.getByText(/This backup holds \d+ pictures and videos/)).toBeVisible();
      await page.getByRole('button', { name: 'Restore', exact: true }).click();
      await expect(page.getByTestId('restore-finished')).toBeVisible();

      expect(await libraryHas(request, `${folder}/slides/one.png`)).toBe(true);
      expect(await libraryHas(request, `${folder}/keep-me.png`)).toBe(true);
      const bg = await request.get(`/api/backgrounds/serve?file=${encodeURIComponent(`${folder}/bg.png`)}`);
      expect((await bg.body()).length).toBe(PNG.length);
      // The config came back with the screen that uses them.
      const inventory = await (await request.get('/api/backgrounds/inventory')).json();
      expect(Object.keys(inventory.usage)).toEqual(expect.arrayContaining([`${folder}/bg.png`, `${folder}/slides/one.png`]));
      expect(inventory.missing.filter((m: { path: string }) => m.path.includes(folder))).toEqual([]);
    } finally {
      await removeFolder(request, folder);
    }
  });

  test('a file that is not a backup is refused before anything changes', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor/settings?section=defaults&page=data');
    await page.getByRole('button', { name: 'Restore from a file' }).click();
    await page.getByRole('button', { name: 'Choose a file…' }).click();
    await page.getByTestId('backup-restore-input').setInputFiles({ name: 'photos.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip at all') });
    await expect(page.getByText(/not a Home Screens backup/)).toBeVisible();
  });
});
