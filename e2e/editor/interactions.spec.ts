import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
}

/** Poll the persisted config until `read` satisfies the matcher. */
async function pollConfig<T>(request: APIRequestContext, read: (c: Awaited<ReturnType<typeof getConfig>>) => T) {
  return expect.poll(async () => read(await getConfig(request)));
}

test.describe('module lifecycle', () => {
  test('resize handle enlarges the module and autosaves', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [textModule('RESIZE ME', { id: 'rz', size: { w: 400, h: 200 } })])],
    }));
    await openEditor(page);

    await page.locator('[data-module-id="rz"]').click();
    const handle = page.locator('[data-module-id="rz"] .cursor-se-resize');
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120, { steps: 15 });
    const saved = page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());
    await page.mouse.up();
    await saved;

    await pollConfig(request, (c) => c.screens[0].modules[0].size.w).then((p) => p.toBeGreaterThan(400));
    await pollConfig(request, (c) => c.screens[0].modules[0].size.h).then((p) => p.toBeGreaterThan(200));
  });

  test('deleting a module removes it from config and the canvas', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [textModule('DELETE ME', { id: 'del' })])],
    }));
    await openEditor(page);

    await page.locator('[data-module-id="del"]').click();
    await page.getByRole('button', { name: 'Delete Module' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(0));
    await expect(page.locator('[data-module-id="del"]')).toBeHidden();
  });

  test('undo restores a deleted module and redo removes it again', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [textModule('UNDO ME', { id: 'u1' })])],
    }));
    await openEditor(page);

    await page.locator('[data-module-id="u1"]').click();
    await page.getByRole('button', { name: 'Delete Module' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(0));

    // Blur the delete button so the undo shortcut isn't swallowed by a control.
    await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(1));
    await expect(page.locator('[data-module-id="u1"]')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+Shift+z');
    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(0));
  });
});

test.describe('screen management', () => {
  test('adding a blank screen appends to config', async ({ page, request }) => {
    await putConfig(request, baseConfig({ screens: [makeScreen('a', 'Screen 1', [])] }));
    await openEditor(page);

    await page.getByRole('button', { name: 'Add screen' }).click();
    await page.getByRole('button', { name: 'Blank Screen' }).click();

    await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(2));
  });

  test('renaming a screen persists the new name', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('a', 'Screen 1', []), makeScreen('b', 'Screen 2', [])],
    }));
    await openEditor(page);

    // Scope to the tab's name span — the active screen name also renders in the panel.
    await page.locator('span.max-w-32', { hasText: 'Screen 1' }).dblclick();
    const input = page.locator('input.w-28');
    await input.fill('Kitchen');
    await input.press('Enter');

    await pollConfig(request, (c) => c.screens.find((s) => s.id === 'a')!.name).then((p) => p.toBe('Kitchen'));
  });

  test('reordering moves a screen via the context menu', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('a', 'Alpha', []), makeScreen('b', 'Bravo', [])],
    }));
    await openEditor(page);

    await page.locator('span.max-w-32', { hasText: 'Alpha' }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Move Right' }).click();

    await pollConfig(request, (c) => c.screens.map((s) => s.id)).then((p) => p.toEqual(['b', 'a']));
  });

  test('deleting a screen removes it from config', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('a', 'Screen 1', []), makeScreen('b', 'Screen 2', [])],
    }));
    await openEditor(page);

    await page.locator('span.max-w-32', { hasText: 'Screen 2' }).click({ button: 'right' });
    // Context menu "Delete" opens a confirm dialog whose primary button reads "Delete".
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await pollConfig(request, (c) => c.screens.map((s) => s.id)).then((p) => p.toEqual(['a']));
  });
});
