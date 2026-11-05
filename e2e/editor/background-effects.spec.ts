import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { autosaved } from '../helpers/editor';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/** Background effects: each slider saves only its own field, and Reset takes it away again. */
test.describe('background effects', () => {
  test('a slider saves one field, the canvas shows the filter, and Reset removes it', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [textModule('FX')], { backgroundImage: '/starter-backgrounds/ocean.svg' })],
    }));
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    // Empty state = screen selected, no module: the background sections live there.
    await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } });

    const brightness = page.getByRole('slider', { name: /Brightness/ });
    await autosaved(page, async () => brightness.fill('120'));
    let screen = (await getConfig(request)).screens[0];
    expect(screen.effects).toEqual({ brightness: 120 });
    await expect(page.getByTestId('editor-canvas').getByTestId('background-media-layer').locator('img')).toHaveCSS('filter', 'brightness(1.2) contrast(1) saturate(1)');

    await autosaved(page, async () => page.getByRole('slider', { name: /Warmth/ }).fill('30'));
    screen = (await getConfig(request)).screens[0];
    expect(screen.effects).toEqual({ brightness: 120, warmth: 30 });

    await autosaved(page, async () => page.getByRole('button', { name: 'Reset Warmth' }).click());
    screen = (await getConfig(request)).screens[0];
    expect(screen.effects).toEqual({ brightness: 120 });

    await autosaved(page, async () => page.getByRole('button', { name: 'Reset Brightness' }).click());
    screen = (await getConfig(request)).screens[0];
    expect(screen.effects).toBeUndefined();
  });
});
