import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, choreChartModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import type { ScreenConfiguration } from '@/types/config';

/**
 * /remote Photos tab. The tab is gated on a `fullscreen-photo` module existing
 * in config (PHOTO_MODULE_TYPES in src/app/(remote)/remote/page.tsx), and the
 * bottom tab bar only renders once there are 2+ tabs (Control is always the
 * first), so a lone photo module is enough to surface it.
 *
 * ISOLATION NOTE: backgrounds are stored on disk under `public/backgrounds`
 * (BACKGROUNDS_DIR), NOT `data/`. The e2e sandbox only gives each worker a
 * private `data/`; every other repo entry — including `public/` — is symlinked,
 * so writes to `public/backgrounds` land in the real repo directory shared by
 * all workers. To stay isolated and safe, every test that touches disk works
 * inside a per-test uniquely-named subfolder and removes it in afterEach. The
 * files are gitignored (`public/backgrounds/*`), so `git status` stays clean.
 * On-disk assertions resolve through the worker's `sandboxDir/public/...`
 * symlink, which points at that same real directory.
 */

// 1x1 transparent PNG — a real, valid image the upload validator and the
// /api/backgrounds/serve route both accept.
const TINY_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Absolute on-disk path inside the backgrounds store (via the sandbox symlink). */
function bgPath(sandboxDir: string, ...segments: string[]): string {
  return path.join(sandboxDir, 'public', 'backgrounds', ...segments);
}

/** Config whose only screen holds a full-screen photo module opening into `directory`. */
function photoConfig(directory = ''): ScreenConfiguration {
  const photo = buildModuleInstance('fullscreen-photo', { directory });
  return baseConfig({ screens: [makeScreen('s1', 'Screen One', [photo])] });
}

/** Slug that survives the folder-name sanitizer (only [A-Za-z0-9._-] kept). */
function uniqueFolder(): string {
  return `e2e-photos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Seed an image straight onto disk the way the UI would, via the real upload API. */
async function seedImage(
  request: APIRequestContext,
  directory: string,
  name: string,
): Promise<void> {
  const res = await request.post('/api/backgrounds', {
    multipart: {
      directory,
      file: { name, mimeType: 'image/png', buffer: TINY_PNG_BYTES },
    },
  });
  expect(res.ok()).toBe(true);
}

// Folders created during a test; removed from the shared real directory after.
const createdFolders: string[] = [];

test.afterEach(async ({ sandboxDir }) => {
  for (const folder of createdFolders) {
    rmSync(bgPath(sandboxDir, folder), { recursive: true, force: true });
  }
  createdFolders.length = 0;
});

test('the Photos tab is gated on a full-screen photo module', async ({ page, request }) => {
  // A chore module alone renders the bottom bar (Control + Chores) but no Photos.
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'Screen One', [choreChartModule()])] }));
  await page.goto('/remote');
  await expect(page.getByRole('button', { name: 'Chores' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Photos' })).toHaveCount(0);

  // Adding a full-screen photo module surfaces the Photos tab.
  await putConfig(request, photoConfig());
  await page.reload();
  const photosTab = page.getByRole('button', { name: 'Photos' });
  await expect(photosTab).toBeVisible();

  // Opening it shows the Photos surface (header + directory pill + upload CTA).
  // No empty-state assertion here: this opens the root ("All Photos"), which on
  // the shared real directory may already hold images.
  await photosTab.click();
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All Photos' })).toBeVisible();
  // Exact match: in an empty folder the empty-state hint "Tap Upload Photos to
  // add images" also contains this text, so a substring match would be ambiguous.
  await expect(page.getByText('Upload Photos', { exact: true })).toBeVisible();
});

test('uploading a photo adds it to the grid and writes it to disk', async ({ page, request, sandboxDir }) => {
  const folder = uniqueFolder();
  createdFolders.push(folder);

  // Open the tab pre-scoped to the isolated folder via the module's directory.
  await putConfig(request, photoConfig(folder));
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Photos' }).click();
  await expect(page.getByText('No photos in this folder')).toBeVisible();
  // With the folder empty, the empty-state hint co-exists with the upload label;
  // the exact-match CTA locator must still resolve to exactly one element.
  await expect(page.getByText('Upload Photos', { exact: true })).toHaveCount(1);

  // The file input is hidden behind a styled label; drive it directly.
  await page.locator('#photo-upload').setInputFiles({
    name: 'e2e-upload.png',
    mimeType: 'image/png',
    buffer: TINY_PNG_BYTES,
  });

  // Success toast, the image renders in the grid, and it exists on disk.
  await expect(page.getByText('1 photo uploaded')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete photo' })).toHaveCount(1);
  await expect
    .poll(() => existsSync(bgPath(sandboxDir, folder, 'e2e-upload.png')))
    .toBe(true);
});

test('creating a folder from the UI lists it as a directory pill', async ({ page, request }) => {
  const folder = uniqueFolder();
  createdFolders.push(folder);

  await putConfig(request, photoConfig());
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Photos' }).click();
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();

  await page.getByRole('button', { name: 'New Folder' }).click();
  await page.getByPlaceholder('Folder name').fill(folder);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByText('Folder created')).toBeVisible();
  // The new folder shows up as a selectable directory pill (name + image count).
  await expect(page.getByRole('button', { name: folder })).toBeVisible();
});

test('deleting a photo removes it from the grid and from disk', async ({ page, request, sandboxDir }) => {
  const folder = uniqueFolder();
  createdFolders.push(folder);
  await seedImage(request, folder, 'e2e-seed.png');
  expect(existsSync(bgPath(sandboxDir, folder, 'e2e-seed.png'))).toBe(true);

  await putConfig(request, photoConfig(folder));
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Photos' }).click();

  // The seeded image renders; open the per-image delete confirmation.
  const deleteButton = page.getByRole('button', { name: 'Delete photo' });
  await expect(deleteButton).toHaveCount(1);
  await deleteButton.click();
  await expect(page.getByText('Delete?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  // Confirmation toast, grid empties, and the file is gone from disk.
  await expect(page.getByText('Photo deleted')).toBeVisible();
  await expect(page.getByText('No photos in this folder')).toBeVisible();
  await expect
    .poll(() => existsSync(bgPath(sandboxDir, folder, 'e2e-seed.png')))
    .toBe(false);
});
