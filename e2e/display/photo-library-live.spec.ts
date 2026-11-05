import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { rmSync } from 'fs';
import path from 'path';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { renderOnDisplay } from '../helpers/display';

/**
 * A wall following the photo library as it changes from a phone: a photo
 * added reaches the slideshow within a few heartbeats (not the list's own
 * 10-minute poll), the phone's slideshow buttons move it, and "Show on the
 * wall" puts one photo over the screen until someone taps it.
 *
 * `public/backgrounds` is shared by every worker (see e2e/remote/photos.spec.ts),
 * so each test works inside its own uniquely named folder and removes it.
 */

const TINY_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function uniqueFolder(): string {
  return `e2e-wall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seedImage(request: APIRequestContext, directory: string, name: string): Promise<void> {
  const res = await request.post('/api/backgrounds', {
    multipart: { directory, file: { name, mimeType: 'image/png', buffer: TINY_PNG_BYTES } },
  });
  expect(res.ok()).toBe(true);
}

const created: string[] = [];
test.afterEach(async ({ sandboxDir }) => {
  for (const folder of created) rmSync(path.join(sandboxDir, 'public', 'backgrounds', folder), { recursive: true, force: true });
  created.length = 0;
});

/** Library paths of the pictures the wall has asked the serve route for, in order. */
function trackServedPictures(page: Page): string[] {
  const served: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname === '/api/backgrounds/serve') served.push(url.searchParams.get('file') ?? '');
  });
  return served;
}

/** The wall's read of one library folder's slideshow list. */
function isFolderList(url: URL, folder: string): boolean {
  return url.pathname === '/api/photo-source/media'
    && url.searchParams.get('kind') === 'library'
    && url.searchParams.get('folder') === folder;
}

test('a photo added from a phone reaches the wall\'s slideshow within a few beats', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await seedImage(request, folder, 'e2e-first.png');
  const slideshow = buildModuleInstance('photo-slideshow', { photoSource: { kind: 'library', folder } });

  const listReads: unknown[][] = [];
  page.on('response', async (res) => {
    const url = new URL(res.url());
    if (!isFolderList(url, folder)) return;
    try {
      listReads.push(await res.json() as unknown[]);
    } catch {
      // A reload disposed the body; the next read counts.
    }
  });
  await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'Hall', [slideshow])] }));
  await expect.poll(() => listReads.length).toBeGreaterThanOrEqual(1);
  expect(listReads[listReads.length - 1]).toHaveLength(1);

  await seedImage(request, folder, 'e2e-second.png');
  // One beat to notice, one beat to settle: far inside the list's own 10 minutes.
  await expect.poll(() => listReads[listReads.length - 1]?.length ?? 0, { timeout: 15_000 }).toBe(2);
});

test('a photo still reaches the wall when the first re-read after it fails', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await seedImage(request, folder, 'e2e-first.png');
  const slideshow = buildModuleInstance('photo-slideshow', { photoSource: { kind: 'library', folder } });
  const isList = (url: URL) => isFolderList(url, folder);

  const listReads: unknown[][] = [];
  page.on('response', async (res) => {
    if (!isList(new URL(res.url())) || !res.ok()) return;
    try {
      listReads.push(await res.json() as unknown[]);
    } catch {
      // A reload disposed the body; the next read counts.
    }
  });
  await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'Hall', [slideshow])] }));
  await expect.poll(() => listReads.length).toBeGreaterThanOrEqual(1);

  // The hub stumbles on the wall's next read of this list, once.
  let failed = 0;
  await page.route(isList, (route) => {
    if (failed > 0) return route.continue();
    failed += 1;
    return route.fulfill({ status: 503, body: 'try later' });
  });
  await seedImage(request, folder, 'e2e-second.png');
  await expect.poll(() => failed, { timeout: 15_000 }).toBe(1);
  // A later beat asks again instead of leaving it to the list's own 10 minutes.
  await expect.poll(() => listReads[listReads.length - 1]?.length ?? 0, { timeout: 20_000 }).toBe(2);
});

test('the slideshow moves on when the phone says next', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  for (const name of ['e2e-a.png', 'e2e-b.png', 'e2e-c.png']) await seedImage(request, folder, name);
  // A long interval, so only the command moves it.
  const slideshow = buildModuleInstance('photo-slideshow', { photoSource: { kind: 'library', folder }, intervalMs: 600_000 });
  const served = trackServedPictures(page);
  await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'Hall', [slideshow])] }));
  await expect.poll(() => new Set(served.filter((f) => f.startsWith(`${folder}/`))).size).toBe(1);
  const first = served.find((f) => f.startsWith(`${folder}/`))!;

  const res = await request.post('/api/display/module-command', { data: { module: 'photo-slideshow', action: 'next' } });
  expect(res.ok()).toBe(true);
  await expect.poll(() => new Set(served.filter((f) => f.startsWith(`${folder}/`))).size, { timeout: 10_000 }).toBe(2);
  expect(served.filter((f) => f.startsWith(`${folder}/`)).at(-1)).not.toBe(first);
});

test('Show on the wall puts a library photo over the screen until it is tapped', async ({ page, request }) => {
  const folder = uniqueFolder();
  created.push(folder);
  await seedImage(request, folder, 'e2e-show.png');
  await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'Hall', [textModule('E2E WALL')])] }));

  // The hub only ever shows what is in the library.
  expect((await request.post('/api/display/show-photo', { data: { file: '../secrets.json' } })).status()).toBe(400);
  expect((await request.post('/api/display/show-photo', { data: { file: `${folder}/nope.png` } })).status()).toBe(404);

  const res = await request.post('/api/display/show-photo', { data: { file: `${folder}/e2e-show.png`, duration: 60 } });
  expect(res.ok()).toBe(true);
  const overlay = page.getByTestId('photo-show');
  await expect(overlay.locator('img')).toBeVisible({ timeout: 10_000 });
  await overlay.click();
  await expect(overlay).toHaveCount(0);
});
