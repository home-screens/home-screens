import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

test.describe('editor canvas', () => {
  // Each test starts from one empty screen so module counts are deterministic.
  test.beforeEach(async ({ page, request }) => {
    await putConfig(request, baseConfig({ screens: [makeScreen('screen-1', 'Screen 1', [])] }));
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
  });

  test('drag a module from the palette onto the canvas, autosaved', async ({ page, request }) => {
    await page.getByPlaceholder('Search modules…').fill('text');
    const item = page.getByTestId('palette-text');
    await expect(item).toBeVisible();

    const from = (await item.boundingBox())!;
    const to = (await page.getByTestId('editor-canvas').boundingBox())!;
    // dnd-kit's PointerSensor requires >5px of travel before the drag activates,
    // so move in steps rather than jumping.
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });

    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok(),
    );
    await page.mouse.up();

    await expect(page.locator('[data-module-type="text"]')).toHaveCount(1);
    await saved; // autosave fires 800ms after the drop

    const config = await getConfig(request);
    expect(config.screens[0].modules).toHaveLength(1);
    expect(config.screens[0].modules[0].type).toBe('text');
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  });

  test('move a placed module and autosave the new position', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [textModule('MOVE ME', { id: 'move-me' })])],
    }));
    await page.reload();

    const placed = page.locator('[data-module-id="move-me"]');
    await expect(placed).toBeVisible();
    const box = (await placed.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 150, { steps: 15 });
    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok(),
    );
    await page.mouse.up();
    await saved;

    const config = await getConfig(request);
    const moved = config.screens[0].modules.find((m) => m.id === 'move-me')!;
    // Canvas is scaled to fit the viewport, so assert movement, not exact deltas.
    expect(moved.position.x).toBeGreaterThan(100);
    expect(moved.position.y).toBeGreaterThan(100);
  });

  test('palette search with no matches shows the empty message', async ({ page }) => {
    await page.getByPlaceholder('Search modules…').fill('zzzznotamodule');
    await expect(page.getByText('No modules found')).toBeVisible();
  });
});

// Own describe (no canvas-expecting beforeEach) — at 600px the editor renders
// the "too narrow" guard instead of a canvas.
test.describe('narrow viewport', () => {
  test.use({ viewport: { width: 600, height: 800 } });

  test('editor refuses to render under 768px', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor');
    await expect(page.getByText(/requires a screen at least/)).toBeVisible();
  });
});
