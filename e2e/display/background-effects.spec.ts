import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * The background layer behind a screen: the picture, the effects filter on
 * it, and the shade over it. The shade and the filter are the screen's own,
 * so a widget's styling never sees them.
 */

const WALL = '/starter-backgrounds/ocean.svg';

test('a screen with effects paints its picture through the filter, with the shade above it', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('fx', 'FX', [textModule('EFFECTS SCREEN')], {
      backgroundImage: WALL,
      effects: { brightness: 120, warmth: 40 },
      shade: { enabled: true, style: 'even', strength: 50, color: '#000000' },
    })],
  }));
  await page.goto('/display');
  await expect(page.getByText('EFFECTS SCREEN')).toBeVisible();

  const layer = page.getByTestId('background-media-layer');
  const picture = layer.locator('img');
  await expect(picture).toHaveAttribute('src', WALL);
  // The first picture is on screen at once, no fade.
  await expect(picture).toHaveCSS('opacity', '1');
  await expect(picture).toHaveCSS('filter', 'brightness(1.2) contrast(1) saturate(1) sepia(0.18) hue-rotate(-7.2deg) saturate(1.032)');

  const shade = layer.getByTestId('background-shade-overlay');
  await expect(shade).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.5)');
  // The shade sits over the picture and under the widgets.
  const order = await layer.evaluate((el) => {
    const img = el.querySelector('img') as HTMLElement;
    const overlay = el.querySelector('[data-testid="background-shade-overlay"]') as HTMLElement;
    return {
      picture: Number(getComputedStyle(img).zIndex),
      shade: Number(getComputedStyle(overlay).zIndex),
      layer: getComputedStyle(el).zIndex,
    };
  });
  expect(order.shade).toBeGreaterThan(order.picture);
  expect(order.layer).toBe('-1');
});

test('a screen without effects carries no filter at all', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('plain', 'Plain', [textModule('PLAIN SCREEN')], { backgroundImage: WALL })],
  }));
  await page.goto('/display');
  await expect(page.getByText('PLAIN SCREEN')).toBeVisible();
  await expect(page.getByTestId('background-media-layer').locator('img')).toHaveCSS('filter', 'none');
  await expect(page.getByTestId('background-shade-overlay')).toHaveCount(0);
});
