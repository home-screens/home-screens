import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * Two editors (or a phone and a laptop) on one config. `PUT /api/config`
 * carries the revision the editor loaded; a stale one is refused with a 409
 * and the hub's current config, and the toolbar offers "Load their changes"
 * / "Keep mine" instead of silently overwriting. An idle editor also notices
 * an outside change and offers a reload (src/hooks/useRemoteConfigWatch.ts).
 *
 * The "other editor" here is the APIRequestContext, which sends no revision
 * header and so always wins — exactly what /remote and a second browser do.
 */

function mine() {
  return baseConfig({ screens: [makeScreen('a', 'A', [textModule('MINE', { id: 'em' })])] });
}
function theirs() {
  return baseConfig({ screens: [makeScreen('a', 'A', [textModule('THEIRS', { id: 'em' })])] });
}

async function openEditor(page: Page) {
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
}

/** Drag the placed module so the editor autosaves. */
async function dirty(page: Page) {
  const box = (await page.locator('[data-module-id="em"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 120, { steps: 15 });
  await page.mouse.up();
}

test('a save over a config changed elsewhere is refused and "Load their changes" takes theirs', async ({ page, request }) => {
  await putConfig(request, mine());
  await openEditor(page);

  await putConfig(request, theirs());
  await dirty(page);

  const conflict = page.getByTestId('save-conflict');
  await expect(conflict).toBeVisible();
  await expect(conflict.getByText('This layout was changed somewhere else.')).toBeVisible();

  await page.getByRole('button', { name: 'Load their changes' }).click();
  await expect(page.locator('[data-module-id="em"]')).toContainText('THEIRS');
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  // Nothing was written: the hub still holds theirs, untouched.
  expect((await getConfig(request)).screens[0].modules[0].config.content).toBe('THEIRS');
});

test('"Keep mine" overwrites the other side\'s version', async ({ page, request }) => {
  await putConfig(request, mine());
  await openEditor(page);

  await putConfig(request, theirs());
  await dirty(page);
  await expect(page.getByTestId('save-conflict')).toBeVisible();

  await page.getByRole('button', { name: 'Keep mine' }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect.poll(async () => {
    const mod = (await getConfig(request)).screens[0].modules[0];
    return `${mod.config.content}@${mod.position.x}`;
  }).toMatch(/^MINE@(?!100$)\d+$/);
});

test('an idle editor notices an outside change and reloads on request', async ({ page, request }) => {
  await putConfig(request, mine());
  await openEditor(page);

  await putConfig(request, theirs());

  // Two 5s polls must agree before the notice shows.
  const notice = page.getByTestId('save-remote-changed');
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await notice.getByRole('button', { name: 'Reload' }).click();

  await expect(page.locator('[data-module-id="em"]')).toContainText('THEIRS');
  await expect(notice).toHaveCount(0);
});
