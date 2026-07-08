import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

test.beforeEach(async ({ page, request }) => {
  await putConfig(request, baseConfig({
    displays: [
      {
        id: 'main', name: 'Main',
        screens: [makeScreen('main-screen', 'Main Screen', [textModule('MAIN DISPLAY', { id: 'main-text' })])],
      },
      {
        id: 'kitchen', name: 'Kitchen',
        screens: [makeScreen('kitchen-screen', 'Kitchen Screen', [textModule('KITCHEN DISPLAY', { id: 'kitchen-text' })])],
      },
    ],
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
});

test('display switcher swaps the canvas to the selected display', async ({ page }) => {
  const switcher = page.locator('#editor-display-switcher');
  await expect(switcher).toBeAttached(); // rendered at opacity 0, so not "visible"
  await expect(page.locator('[data-module-id="main-text"]')).toBeVisible();

  await switcher.selectOption('kitchen');
  await expect(page.locator('[data-module-id="kitchen-text"]')).toBeVisible();
  await expect(page.locator('[data-module-id="main-text"]')).toHaveCount(0);
});
